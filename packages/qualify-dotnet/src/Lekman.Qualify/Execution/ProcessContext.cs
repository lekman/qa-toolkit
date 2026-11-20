using System.Collections;
using System.Reflection;
using System.Text.Json.Nodes;
using Lekman.Qualify.Envelope;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Settings;

namespace Lekman.Qualify.Execution;

/// <summary>What the runtime reads from and writes to the process.</summary>
public interface IRuntimeDependencies
{
    /// <summary>The environment variables.</summary>
    IReadOnlyDictionary<string, string> Environment { get; }

    /// <summary>The working directory.</summary>
    string WorkingDirectory { get; }

    /// <summary>Reads git facts.</summary>
    IGitProbe Git { get; }

    /// <summary>Writes evidence files.</summary>
    IEvidenceWriter Writer { get; }

    /// <summary>The current time.</summary>
    DateTimeOffset Now();

    /// <summary>Reports a warning.</summary>
    void Warn(string message);
}

/// <summary>The real process. System layer.</summary>
public sealed class SystemRuntime : IRuntimeDependencies
{
    /// <summary>The shared instance.</summary>
    public static SystemRuntime Instance { get; } = new();

    /// <inheritdoc />
    public IReadOnlyDictionary<string, string> Environment
    {
        get
        {
            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (DictionaryEntry entry in System.Environment.GetEnvironmentVariables())
            {
                result[(string)entry.Key] = (string?)entry.Value ?? string.Empty;
            }

            return result;
        }
    }

    /// <inheritdoc />
    public string WorkingDirectory => Directory.GetCurrentDirectory();

    /// <inheritdoc />
    public IGitProbe Git { get; } = new GitProbe();

    /// <inheritdoc />
    public IEvidenceWriter Writer { get; } = new AtomicFileWriter();

    /// <inheritdoc />
    public DateTimeOffset Now() => DateTimeOffset.UtcNow;

    /// <inheritdoc />
    public void Warn(string message) => Console.Error.WriteLine(message);
}

/// <summary>Everything a test needs from the process that runs it. Built once per process.</summary>
public sealed record ProcessContext
{
    /// <summary>The run envelope every file of this process carries.</summary>
    public required JsonObject Envelope { get; init; }

    /// <summary>The absolute evidence directory.</summary>
    public required string EvidenceDir { get; init; }

    /// <summary>The resolved settings.</summary>
    public required ResolvedSettings Settings { get; init; }

    /// <summary>The folder sites are relative to: the repository root, or the working directory.</summary>
    public required string SiteRoot { get; init; }

    /// <summary>The process's reads and writes.</summary>
    public required IRuntimeDependencies Dependencies { get; init; }

    internal SecretRegistry Registry { get; init; } = new();
}

/// <summary>
/// The composition root: options, the secret registry, and the process
/// context, built once per process on first use.
/// </summary>
public static class QualifyRuntime
{
    /// <summary>The package name recorded in <c>run.tool.name</c>.</summary>
    public const string ToolName = "Lekman.Qualify";

    private static readonly Lock Gate = new();
    private static QualifyOptions options = new();
    private static IRuntimeDependencies dependencies = SystemRuntime.Instance;
    private static (ProcessContext? Context, Exception? Error)? built;
    private static string? createdRunId;

    /// <summary>The package version recorded in <c>run.tool.version</c>.</summary>
    public static string ToolVersion { get; } =
        typeof(QualifyRuntime).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
        ?? "0.0.0";

    /// <summary>The runtime and the runner, for example <c>.NET 11.0.0; xunit.v3 4.0.3</c>.</summary>
    public static string RuntimeDescription
    {
        get
        {
            var xunit = typeof(global::Xunit.FactAttribute).Assembly
                .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "unknown";
            return $".NET {System.Environment.Version}; xunit.v3 {xunit}";
        }
    }

    /// <summary>Give settings in code. Environment variables still win. Call before the first test runs.</summary>
    public static void Configure(QualifyOptions value)
    {
        lock (Gate)
        {
            options = value;
            built = null;
        }
    }

    /// <summary>Replace the process's reads and writes, for tests of qualify itself.</summary>
    internal static void UseDependencies(IRuntimeDependencies value)
    {
        lock (Gate)
        {
            dependencies = value;
            built = null;
        }
    }

    /// <summary>
    /// The process context, built on first use. A configuration error is kept
    /// and thrown again for every later test.
    /// </summary>
    public static ProcessContext Process()
    {
        lock (Gate)
        {
            built ??= Build();
            return built.Value.Context ?? throw built.Value.Error!;
        }
    }

    /// <summary>The folder sites are relative to, without building the rest of the context.</summary>
    public static string SiteRoot()
    {
        lock (Gate)
        {
            return built?.Context?.SiteRoot ?? dependencies.Git.Read(dependencies.WorkingDirectory).Root ?? dependencies.WorkingDirectory;
        }
    }

    private static (ProcessContext?, Exception?) Build()
    {
        try
        {
            var env = dependencies.Environment;
            var settings = SettingsResolver.Resolve(env, options);
            var runId = RunId(env);
            var git = dependencies.Git.Read(dependencies.WorkingDirectory);
            var envelope = RunEnvelope.Build(
                runId,
                settings.Environment,
                new ToolInfo(ToolName, ToolVersion, "csharp", RuntimeDescription),
                git,
                env,
                settings.ProductionWriteBlocked,
                settings.Overrides);
            var context = new ProcessContext
            {
                Envelope = envelope,
                EvidenceDir = Path.GetFullPath(settings.EvidenceDir, dependencies.WorkingDirectory),
                Settings = settings,
                SiteRoot = git.Root ?? dependencies.WorkingDirectory,
                Dependencies = dependencies,
            };
            return (context, null);
        }
        catch (ConfigurationException error)
        {
            return (null, error);
        }
    }

    /// <summary>
    /// The run ID: <c>QUALIFY_RUN_ID</c> when set, otherwise one ULID created
    /// for this process and shared by every test in it.
    /// </summary>
    private static string RunId(IReadOnlyDictionary<string, string> env)
    {
        if (env.TryGetValue("QUALIFY_RUN_ID", out var given) && given.Length > 0)
        {
            return Ulid.IsValid(given) ? given : throw new ConfigurationException($"QUALIFY_RUN_ID {given} is not a ULID");
        }

        return createdRunId ??= Ulid.New();
    }
}
