using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lekman.Qualify.Checks;
using Lekman.Qualify.Redaction;
using Lekman.Qualify.Values;

namespace Lekman.Qualify;

/// <summary>What a context needs from the process that runs the test.</summary>
internal sealed record ContextSettings
{
    public required string Id { get; init; }

    public required string Level { get; init; }

    public required string Environment { get; init; }

    public required long AttachmentLimit { get; init; }

    public required Func<string, string?> ReadSecret { get; init; }

    public required SecretRegistry Registry { get; init; }

    /// <summary>The <c>actor</c>, <c>source</c> and <c>target</c> of the run envelope.</summary>
    public required Func<(JsonNode Actor, JsonNode Source, JsonNode Target)> RunContext { get; init; }

    /// <summary>Formats a source path and line as a site.</summary>
    public required Func<string?, int, string> Site { get; init; }

    public required Func<DateTimeOffset> Now { get; init; }

    public required Action<string> Warn { get; init; }
}

/// <summary>
/// The context of one qualification test: its identity, checks, attachments,
/// secrets and runtime skip. qualify sets <see cref="Current"/> for the
/// duration of a test declared with <see cref="IQAttribute"/>,
/// <see cref="OQAttribute"/>, <see cref="PQAttribute"/> or <see cref="IUAttribute"/>.
/// Checks and attachments are held in memory; qualify redacts and writes
/// them when the body ends.
/// </summary>
public sealed partial class QualifyContext
{
    private static readonly AsyncLocal<QualifyContext?> Ambient = new();

    private readonly ContextSettings settings;
    private readonly List<CheckRecord> recorded = [];
    private readonly List<PendingAttachment> attached = [];
    private readonly SortedSet<string> secrets = [with(CodePointComparer.Instance)];
    private readonly List<Task> pending = [];
    private readonly Lock gate = new();
    private int seq;

    internal QualifyContext(ContextSettings settings)
    {
        this.settings = settings;
    }

    /// <summary>
    /// The context of the qualification test running on this async flow.
    /// Throws outside such a test.
    /// </summary>
    public static QualifyContext Current =>
        Ambient.Value ?? throw new InvalidOperationException(
            "QualifyContext.Current is set only inside a test declared with [IQ], [OQ], [PQ] or [IU].");

    /// <summary>The test ID.</summary>
    public string Id => settings.Id;

    /// <summary>The test level: IQ, OQ, PQ or IU.</summary>
    public string Level => settings.Level;

    /// <summary>The environment the test runs in.</summary>
    public string Environment => settings.Environment;

    /// <summary>Start a hard check. A failed hard check ends the test with <see cref="CheckFailedException"/>.</summary>
    /// <param name="context">What is checked, for example a component or endpoint.</param>
    /// <param name="description">The claim, in words a reviewer can read.</param>
    /// <param name="sourceFilePath">Filled in by the compiler.</param>
    /// <param name="sourceLineNumber">Filled in by the compiler.</param>
    public CheckBuilder Check(
        string context,
        string description,
        [CallerFilePath] string? sourceFilePath = null,
        [CallerLineNumber] int sourceLineNumber = 0)
    {
        NonEmpty(context, "check context");
        NonEmpty(description, "check description");
        return new CheckBuilder(this, context, description, settings.Site(sourceFilePath, sourceLineNumber), soft: false);
    }

    /// <summary>Run work that has its own assertions and record it as one <c>delegate</c> check.</summary>
    /// <param name="context">What is checked.</param>
    /// <param name="description">The claim.</param>
    /// <param name="action">The work to run. A failure inside it keeps its own type.</param>
    /// <param name="sourceFilePath">Filled in by the compiler.</param>
    /// <param name="sourceLineNumber">Filled in by the compiler.</param>
    public void Delegate(
        string context,
        string description,
        Action action,
        [CallerFilePath] string? sourceFilePath = null,
        [CallerLineNumber] int sourceLineNumber = 0)
    {
        ArgumentNullException.ThrowIfNull(action);
        Delegate(context, description, () =>
        {
            action();
            return true;
        }, action.Method, sourceFilePath, sourceLineNumber);
    }

    /// <summary>Run a function that has its own assertions, record it as one <c>delegate</c> check, and return its result.</summary>
    /// <typeparam name="T">The result type.</typeparam>
    /// <param name="context">What is checked.</param>
    /// <param name="description">The claim.</param>
    /// <param name="function">The work to run. A failure inside it keeps its own type.</param>
    /// <param name="sourceFilePath">Filled in by the compiler.</param>
    /// <param name="sourceLineNumber">Filled in by the compiler.</param>
    /// <returns>What the function returned.</returns>
    public T Delegate<T>(
        string context,
        string description,
        Func<T> function,
        [CallerFilePath] string? sourceFilePath = null,
        [CallerLineNumber] int sourceLineNumber = 0)
    {
        ArgumentNullException.ThrowIfNull(function);
        return Delegate(context, description, function, function.Method, sourceFilePath, sourceLineNumber);
    }

    /// <summary>Run asynchronous work that has its own assertions and record it as one <c>delegate</c> check.</summary>
    /// <param name="context">What is checked.</param>
    /// <param name="description">The claim.</param>
    /// <param name="work">The work to run. A failure inside it keeps its own type.</param>
    /// <param name="sourceFilePath">Filled in by the compiler.</param>
    /// <param name="sourceLineNumber">Filled in by the compiler.</param>
    /// <returns>A task that completes when the work does.</returns>
    public Task DelegateAsync(
        string context,
        string description,
        Func<Task> work,
        [CallerFilePath] string? sourceFilePath = null,
        [CallerLineNumber] int sourceLineNumber = 0)
    {
        ArgumentNullException.ThrowIfNull(work);
        return DelegateAsync(context, description, async () =>
        {
            await work().ConfigureAwait(false);
            return true;
        }, work.Method, sourceFilePath, sourceLineNumber);
    }

    /// <summary>Run an asynchronous function that has its own assertions, record it as one <c>delegate</c> check, and return its result.</summary>
    /// <typeparam name="T">The result type.</typeparam>
    /// <param name="context">What is checked.</param>
    /// <param name="description">The claim.</param>
    /// <param name="work">The work to run. A failure inside it keeps its own type.</param>
    /// <param name="sourceFilePath">Filled in by the compiler.</param>
    /// <param name="sourceLineNumber">Filled in by the compiler.</param>
    /// <returns>What the function returned.</returns>
    public Task<T> DelegateAsync<T>(
        string context,
        string description,
        Func<Task<T>> work,
        [CallerFilePath] string? sourceFilePath = null,
        [CallerLineNumber] int sourceLineNumber = 0)
    {
        ArgumentNullException.ThrowIfNull(work);
        return DelegateAsync(context, description, work, work.Method, sourceFilePath, sourceLineNumber);
    }

    /// <summary>Add a text attachment, stored as its UTF-8 bytes. JSON text with content type <c>application/json</c> is parsed and written like evidence.</summary>
    /// <param name="filename">The file name, without <c>/</c> or <c>\</c>.</param>
    /// <param name="body">The text.</param>
    /// <param name="contentType">The media type.</param>
    public void Attach(string filename, string body, string contentType)
    {
        ArgumentNullException.ThrowIfNull(body);
        AttachPending(Pending(filename, contentType, Encoding.UTF8.GetBytes(body)));
    }

    /// <summary>Add a binary attachment. It is redacted as bytes.</summary>
    /// <param name="filename">The file name, without <c>/</c> or <c>\</c>.</param>
    /// <param name="body">The bytes.</param>
    /// <param name="contentType">The media type.</param>
    public void Attach(string filename, byte[] body, string contentType)
    {
        ArgumentNullException.ThrowIfNull(body);
        AttachPending(Pending(filename, contentType, [.. body]));
    }

    /// <summary>Add a JSON attachment from a value, normalised and redacted like evidence.</summary>
    /// <param name="filename">The file name, without <c>/</c> or <c>\</c>.</param>
    /// <param name="value">The value.</param>
    /// <param name="contentType">The media type, which must be <c>application/json</c>.</param>
    public void Attach(string filename, object? value, string contentType = "application/json")
    {
        CheckFilename(filename, contentType);
        if (!IsJsonType(contentType))
        {
            throw new ArgumentException(
                $"attachment {filename}: only application/json takes an object body; pass a string or bytes", nameof(contentType));
        }

        AttachPending(new PendingAttachment(filename, contentType, Normaliser.Normalise(value), null));
    }

    /// <summary>Read a named secret and register its value for redaction. The default source reads <c>QUALIFY_SECRET_&lt;NAME&gt;</c>.</summary>
    /// <param name="name">Letters, digits and underscores.</param>
    /// <returns>The secret value.</returns>
    public string Secret(string name)
    {
        if (name is null || !SecretName().IsMatch(name))
        {
            throw new ArgumentException($"secret name {name} must be letters, digits and underscores", nameof(name));
        }

        var value = settings.ReadSecret(name);
        if (string.IsNullOrEmpty(value))
        {
            throw new SecretNotFoundException($"secret {name} is not set (the default source reads QUALIFY_SECRET_{name})");
        }

        lock (gate)
        {
            secrets.Add(name);
        }

        Redact(value);
        return value;
    }

    /// <summary>Register a value for redaction and return it unchanged. A value shorter than 6 characters is refused with a warning.</summary>
    /// <param name="value">The value to hide.</param>
    /// <returns>The same value.</returns>
    public string Redact(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (!settings.Registry.Add(value))
        {
            settings.Warn(
                $"qualify: {Id}: a value shorter than {Redactor.MinLength} characters was not registered for redaction");
        }

        return value;
    }

    /// <summary>Skip the test at runtime. xUnit reports it as skipped and the record holds the reason.</summary>
    /// <param name="reason">Why the test was skipped.</param>
    [DoesNotReturn]
    [SuppressMessage("Performance", "CA1822:Mark members as static", Justification = "Part of the context a test receives: tests call ctx.Skip(reason), as the specification names it.")]
    public void Skip(string reason)
    {
        NonEmpty(reason, "skip reason");
        throw new SkipException(reason);
    }

    /// <summary>
    /// Attach <c>run-context.json</c>: the run envelope's <c>source</c>,
    /// <c>actor</c> and <c>target</c>, plus any extra values.
    /// </summary>
    /// <param name="extra">Values to add under <c>extra</c>.</param>
    public void RunContext(IReadOnlyDictionary<string, object?>? extra = null)
    {
        var (actor, source, target) = settings.RunContext();
        var values = new JsonObject();
        foreach (var (key, value) in extra ?? new Dictionary<string, object?>())
        {
            values[key] = Normaliser.Normalise(value);
        }

        Attach(
            "run-context.json",
            new JsonObject
            {
                ["actor"] = actor.DeepClone(),
                ["extra"] = values,
                ["source"] = source.DeepClone(),
                ["target"] = target.DeepClone(),
            },
            "application/json");
    }

    internal static IDisposable Enter(QualifyContext context)
    {
        var previous = Ambient.Value;
        Ambient.Value = context;
        return new Restore(previous);
    }

    /// <summary>Checks recorded so far, in call order.</summary>
    internal IReadOnlyList<CheckRecord> Checks()
    {
        lock (gate)
        {
            return [.. recorded.OrderBy(c => c.Seq)];
        }
    }

    /// <summary>Attachments added so far, not yet redacted.</summary>
    internal IReadOnlyList<PendingAttachment> Attachments()
    {
        lock (gate)
        {
            return [.. attached];
        }
    }

    /// <summary>Names of secrets read, sorted by code point.</summary>
    internal IReadOnlyList<string> SecretsUsed()
    {
        lock (gate)
        {
            return [.. secrets];
        }
    }

    /// <summary>Failed soft checks, in call order.</summary>
    internal IReadOnlyList<CheckRecord> SoftFailures() => [.. Checks().Where(c => c.Soft && !c.Pass)];

    /// <summary>Wait for delegated work the body did not await, and return the first failure.</summary>
    internal async Task<Exception?> Settle()
    {
        Task[] tasks;
        lock (gate)
        {
            tasks = [.. pending];
        }

        foreach (var task in tasks)
        {
            try
            {
                await task.ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                return exception;
            }
        }

        return null;
    }

    internal bool Record(string context, string description, string site, bool soft, string matcher, MatchResult result)
    {
        var position = Interlocked.Increment(ref seq) - 1;
        Add(new CheckRecord
        {
            Seq = position,
            Context = context,
            Description = description,
            Matcher = matcher,
            Expected = result.Expected,
            Actual = result.Actual,
            Pass = result.Pass,
            Soft = soft,
            Site = site,
            At = Normaliser.Timestamp(settings.Now()),
        });
        if (!result.Pass && !soft)
        {
            throw new CheckFailedException($"{context}: {description}", site);
        }

        return result.Pass;
    }

    private static bool IsJsonType(string contentType) => JsonType().IsMatch(contentType.Trim());

    private static void NonEmpty(string? value, string what)
    {
        if (string.IsNullOrEmpty(value))
        {
            throw new ArgumentException($"{what} must be a non-empty string");
        }
    }

    private static void CheckFilename(string filename, string contentType)
    {
        NonEmpty(filename, "attachment filename");
        if (filename.Contains('/', StringComparison.Ordinal) || filename.Contains('\\', StringComparison.Ordinal))
        {
            throw new ArgumentException($"attachment filename {filename} must not contain / or \\", nameof(filename));
        }

        NonEmpty(contentType, "attachment content type");
    }

    private static string DelegateName(System.Reflection.MethodInfo method) =>
        method.DeclaringType is null ? method.Name : $"{method.DeclaringType.FullName}.{method.Name}";

    private static PendingAttachment Pending(string filename, string contentType, byte[] bytes)
    {
        CheckFilename(filename, contentType);
        if (IsJsonType(contentType))
        {
            try
            {
                var value = JsonNode.Parse(bytes);
                return new PendingAttachment(filename, contentType, Normaliser.Normalise(value), null);
            }
            catch (JsonException)
            {
                // Not valid JSON: keep the bytes as given.
            }
        }

        return new PendingAttachment(filename, contentType, null, bytes);
    }

    private void AttachPending(PendingAttachment attachment)
    {
        // Measured before redaction, because a later secret could still change it.
        var size = attachment.Bytes?.LongLength ?? Encoding.UTF8.GetByteCount(JsonText.Document(attachment.Json));
        if (size > settings.AttachmentLimit)
        {
            throw new AttachmentTooLargeException(
                $"attachment {attachment.Filename} is {size} bytes, over the limit of {settings.AttachmentLimit} bytes");
        }

        lock (gate)
        {
            attached.Add(attachment);
        }
    }

    private void Add(CheckRecord record)
    {
        lock (gate)
        {
            recorded.Add(record);
        }
    }

    private CheckRecord DelegateRecord(int position, string context, string description, string site, string name, Exception? failure) => new()
    {
        Seq = position,
        Context = context,
        Description = description,
        Matcher = "delegate",
        Expected = JsonValue.Create("completes"),
        Actual = JsonValue.Create(failure?.Message ?? "completed"),
        Pass = failure is null,
        Soft = false,
        Site = site,
        Delegate = name,
        At = Normaliser.Timestamp(settings.Now()),
    };

    private T Delegate<T>(string context, string description, Func<T> function, System.Reflection.MethodInfo method, string? file, int line)
    {
        NonEmpty(context, "delegate context");
        NonEmpty(description, "delegate description");
        var position = Interlocked.Increment(ref seq) - 1;
        var site = settings.Site(file, line);
        var name = DelegateName(method);
        T result;
        try
        {
            result = function();
        }
        catch (Exception exception)
        {
            Add(DelegateRecord(position, context, description, site, name, exception));
            throw;
        }

        Add(DelegateRecord(position, context, description, site, name, null));
        return result;
    }

    private Task<T> DelegateAsync<T>(string context, string description, Func<Task<T>> work, System.Reflection.MethodInfo method, string? file, int line)
    {
        NonEmpty(context, "delegate context");
        NonEmpty(description, "delegate description");
        var position = Interlocked.Increment(ref seq) - 1;
        var site = settings.Site(file, line);
        var name = DelegateName(method);
        var task = Run();
        lock (gate)
        {
            pending.Add(task);
        }

        return task;

        async Task<T> Run()
        {
            try
            {
                var result = await work().ConfigureAwait(false);
                Add(DelegateRecord(position, context, description, site, name, null));
                return result;
            }
            catch (Exception exception)
            {
                Add(DelegateRecord(position, context, description, site, name, exception));
                throw;
            }
        }
    }

    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]*$")]
    private static partial Regex SecretName();

    [GeneratedRegex(@"^application/json\s*(;|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex JsonType();

    private sealed class Restore(QualifyContext? previous) : IDisposable
    {
        public void Dispose() => Ambient.Value = previous;
    }
}

/// <summary>Registered secret values, refusing values too short to redact safely. Shared by every test in the process.</summary>
internal sealed class SecretRegistry
{
    private readonly Lock gate = new();
    private readonly List<string> values = [];

    /// <summary>Register a value. Returns false when it is too short.</summary>
    public bool Add(string value)
    {
        if (value.Length < Redactor.MinLength)
        {
            return false;
        }

        lock (gate)
        {
            if (!values.Contains(value))
            {
                values.Add(value);
            }
        }

        return true;
    }

    /// <summary>Every registered value, in registration order.</summary>
    public IReadOnlyList<string> Values()
    {
        lock (gate)
        {
            return [.. values];
        }
    }
}
