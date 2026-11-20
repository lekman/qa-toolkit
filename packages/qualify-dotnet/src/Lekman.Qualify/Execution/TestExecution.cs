using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Text.Json.Nodes;
using Lekman.Qualify.Checks;
using Lekman.Qualify.Declarations;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Redaction;
using Lekman.Qualify.Settings;
using Lekman.Qualify.Values;

namespace Lekman.Qualify.Execution;

/// <summary>
/// Runs one qualification test: write the started marker, apply the policy,
/// set the context, run the body, classify the outcome and write the redacted
/// record. The xUnit test runner calls it in place of the plain method call,
/// so the outcome never depends on runner hooks.
/// </summary>
public static class TestExecution
{
    /// <summary>Run a body and write its evidence. Throws what xUnit must see: a skip, a failure, or nothing.</summary>
    /// <param name="declaration">The validated declaration.</param>
    /// <param name="sourceFile">The source path of the declaration, as the compiler gave it.</param>
    /// <param name="invoke">Calls the test method; may return a task.</param>
    /// <param name="process">The process context.</param>
    public static async Task Run(Declaration declaration, string? sourceFile, Func<object?> invoke, ProcessContext process)
    {
        ArgumentNullException.ThrowIfNull(declaration);
        ArgumentNullException.ThrowIfNull(invoke);
        ArgumentNullException.ThrowIfNull(process);

        var deps = process.Dependencies;
        var run = (JsonObject)Redactor.Value(process.Envelope, [])!;
        var key = EvidenceFiles.Key(declaration.Site);
        var records = Path.Combine(process.EvidenceDir, EvidenceFiles.RecordsFolder);
        var runId = (string)run["id"]!;
        var started = deps.Now();

        var test = (JsonObject)Redactor.Value(declaration.ToJson(), process.Registry.Values())!;
        test["startedAt"] = Normaliser.Timestamp(started);
        var marker = new JsonObject
        {
            ["schemaVersion"] = 1,
            ["kind"] = "started",
            ["run"] = run.DeepClone(),
            ["test"] = test,
        };
        deps.Writer.Write(
            Path.Combine(records, EvidenceFiles.Marker(runId, declaration.Id, key)),
            JsonText.Document(marker, EvidenceShape.File));

        var policySkip = Policy.SkipReason(declaration, process.Settings);
        var context = new QualifyContext(new ContextSettings
        {
            Id = declaration.Id,
            Level = declaration.Level,
            Environment = process.Settings.Environment,
            AttachmentLimit = process.Settings.AttachmentLimit,
            ReadSecret = process.Settings.ReadSecret,
            Registry = process.Registry,
            RunContext = () => (run["actor"]!, run["source"]!, run["target"]!),
            Site = (file, line) => Sites.Format(file, line, process.SiteRoot),
            Now = deps.Now,
            Warn = deps.Warn,
        });

        Exception? thrown = null;
        if (policySkip is null)
        {
            using (QualifyContext.Enter(context))
            {
                try
                {
                    await Await(invoke()).ConfigureAwait(false);
                }
                catch (TargetInvocationException wrapped) when (wrapped.InnerException is not null)
                {
                    thrown = wrapped.InnerException;
                }
                catch (Exception exception)
                {
                    thrown = exception;
                }

                thrown ??= await context.Settle().ConfigureAwait(false);
            }
        }

        var classification = policySkip is null
            ? Outcomes.Classify(thrown, context.SoftFailures().Count)
            : new Classification("skip", SkipReason: policySkip);
        var ended = deps.Now();
        var registered = process.Registry.Values();

        var record = declaration.ToJson();
        record["outcome"] = classification.Outcome;
        if (classification.SkipReason is not null)
        {
            record["skipReason"] = classification.SkipReason;
        }

        if (classification.FailureType is not null)
        {
            record["error"] = new JsonObject
            {
                ["type"] = classification.FailureType,
                ["message"] = classification.FailureMessage,
                ["site"] = FailureSite(thrown, context, sourceFile, process.SiteRoot),
            };
        }

        record["startedAt"] = Normaliser.Timestamp(started);
        record["endedAt"] = Normaliser.Timestamp(ended);
        record["durationMs"] = Math.Max(0L, (long)(ended - started).TotalMilliseconds);
        record["checks"] = new JsonArray([.. context.Checks().Select(c => (JsonNode)c.ToJson())]);
        record["attachments"] = new JsonArray();
        record["secretsUsed"] = new JsonArray([.. context.SecretsUsed().Select(s => (JsonNode)s)]);
        var redacted = (JsonObject)Redactor.Value(record, registered)!;
        redacted["attachments"] = new JsonArray([.. context.Attachments().Select(a => (JsonNode)Attachments.Finalise(a, registered))]);

        var file = new JsonObject
        {
            ["schemaVersion"] = 1,
            ["kind"] = "record",
            ["run"] = run.DeepClone(),
            ["test"] = redacted,
        };
        deps.Writer.Write(
            Path.Combine(records, EvidenceFiles.Record(runId, declaration.Id, key)),
            JsonText.Document(file, EvidenceShape.File));

        switch (classification.Outcome)
        {
            case "pass":
                return;
            case "skip":
                throw thrown is not null && thrown is not SkipException
                    ? Scrub(thrown, registered)
                    : new SkipException(classification.SkipReason!);
            default:
                var failure = thrown ?? new CheckFailedException(
                    classification.FailureMessage!,
                    (context.SoftFailures() is [var first, ..] ? first.Site : declaration.Site));
                ExceptionDispatchInfo.Throw(Scrub(failure, registered));
                return;
        }
    }

    /// <summary>
    /// The site of the first failure: the failing check, the first failed soft
    /// check, or the innermost frame of the exception in the test's own file.
    /// </summary>
    private static string? FailureSite(Exception? thrown, QualifyContext context, string? sourceFile, string root)
    {
        if (thrown is null)
        {
            return context.SoftFailures() is [var first, ..] ? first.Site : null;
        }

        if (thrown is CheckFailedException failed)
        {
            return failed.Site;
        }

        if (sourceFile is null)
        {
            return null;
        }

        var frame = Sites.InFile(thrown, sourceFile);
        return frame is null ? null : Sites.Format(frame.Value.Path, frame.Value.Line, root);
    }

    /// <summary>Replace an exception whose message or stack trace holds a registered secret.</summary>
    private static Exception Scrub(Exception exception, IReadOnlyList<string> registered)
    {
        var message = Redactor.Text(exception.Message, registered);
        var stack = exception.StackTrace is null ? null : Redactor.Text(exception.StackTrace, registered);
        if (message == exception.Message && stack == exception.StackTrace)
        {
            return exception;
        }

        var name = Outcomes.TypeName(exception);
        return Outcomes.IsAssertion(exception)
            ? new RedactedAssertion(name, message, stack)
            : new RedactedException(name, message, stack);
    }

    private static async Task Await(object? result)
    {
        switch (result)
        {
            case null:
                return;
            case Task task:
                await task.ConfigureAwait(false);
                return;
            case ValueTask valueTask:
                await valueTask.ConfigureAwait(false);
                return;
        }

        var type = result.GetType();
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(ValueTask<>))
        {
            var task = (Task)type.GetMethod(nameof(ValueTask<int>.AsTask))!.Invoke(result, null)!;
            await task.ConfigureAwait(false);
        }
    }
}

/// <summary>Turns held attachments into redacted, encoded records.</summary>
public static class Attachments
{
    /// <summary>
    /// Redact and encode one attachment. A JSON attachment is redacted as
    /// JSON, then written like an evidence file; any other attachment is
    /// redacted as bytes.
    /// </summary>
    public static JsonObject Finalise(PendingAttachment pending, IReadOnlyList<string> registered)
    {
        ArgumentNullException.ThrowIfNull(pending);
        var bytes = pending.IsJson
            ? new UTF8Encoding(false).GetBytes(JsonText.Document(Redactor.Json(pending.Json, registered)))
            : Redactor.Bytes(pending.Bytes!, registered);
        return new JsonObject
        {
            ["filename"] = Redactor.Text(pending.Filename, registered),
            ["contentType"] = pending.ContentType,
            ["encoding"] = "base64",
            ["content"] = Convert.ToBase64String(bytes),
            ["sizeBytes"] = bytes.LongLength,
            ["sha256"] = EvidenceFiles.Sha256(bytes),
        };
    }
}
