using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lekman.Qualify.Envelope;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Execution;
using Lekman.Qualify.Merge;
using Lekman.Qualify.Schema;
using Lekman.Qualify.Settings;
using Lekman.Qualify.Values;

namespace Lekman.Qualify.Cli;

/// <summary>What the commands read from and write to.</summary>
public interface ICliIO
{
    /// <summary>The environment variables.</summary>
    IReadOnlyDictionary<string, string> Environment { get; }

    /// <summary>The working directory.</summary>
    string WorkingDirectory { get; }

    /// <summary>Reads git facts.</summary>
    IGitProbe Git { get; }

    /// <summary>Writes files atomically.</summary>
    IEvidenceWriter Writer { get; }

    /// <summary>Standard output.</summary>
    TextWriter Out { get; }

    /// <summary>Standard error.</summary>
    TextWriter Err { get; }

    /// <summary>The current time.</summary>
    DateTimeOffset Now();

    /// <summary>Read a file's bytes.</summary>
    byte[] ReadBytes(string path);

    /// <summary>The files of a records directory.</summary>
    IReadOnlyList<MergeInput> ReadRecords(string recordsDir);
}

/// <summary>The exit codes of section 8 of the specification.</summary>
public static class ExitCodes
{
    /// <summary>Every included test passed.</summary>
    public const int Ok = 0;

    /// <summary>At least one fail or error.</summary>
    public const int Failed = 1;

    /// <summary>Invalid input.</summary>
    public const int Invalid = 2;

    /// <summary>Incomplete.</summary>
    public const int Incomplete = 3;

    /// <summary>Usage error.</summary>
    public const int Usage = 64;
}

/// <summary>
/// The <c>qualify</c> commands of the .NET tool: <c>merge</c>, <c>validate</c>
/// and <c>report</c>. <c>trace</c> belongs to the TypeScript CLI. All I/O goes
/// through <see cref="ICliIO"/>.
/// </summary>
public static class QualifyCommands
{
    /// <summary>The usage text.</summary>
    public const string Usage = """
        Usage:
          qualify merge    [--evidence-dir DIR] [--allow-runs ID,ID] [--out FILE]
          qualify validate FILE...
          qualify report   RUNFILE --pdf FILE [--protocol protocol.yaml] [--map trace.yaml]
                           [--title TEXT] [--document-id TEXT]
                           [--signatures ROLE;ROLE;...] [--no-signatures]
          qualify trace    is in the TypeScript CLI: npx @lekman/qualify trace ...
          qualify --help | --version

        Exit codes: 0 pass, 1 fail or error, 2 invalid input, 3 incomplete, 64 usage.

        """;

    /// <summary>The message <c>trace</c> prints.</summary>
    public const string TracePointer =
        "qualify trace is not part of the .NET tool. Run it with the TypeScript CLI, which reads the same run file:\n" +
        "  npx @lekman/qualify trace EVIDENCE... [--protocol protocol.yaml] [--map trace.yaml] [--md trace.md] [--json trace.json] [--fail-on-skip]\n";

    /// <summary>Run the CLI with arguments, without the program name. Returns the exit code.</summary>
    public static int Run(IReadOnlyList<string> args, ICliIO io)
    {
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(io);
        var command = args.Count > 0 ? args[0] : null;
        var rest = args.Skip(1).ToList();
        try
        {
            switch (command)
            {
                case "--help" or "-h":
                    io.Out.Write(Usage);
                    return ExitCodes.Ok;
                case "--version" or "-v":
                    io.Out.Write(QualifyRuntime.ToolVersion + "\n");
                    return ExitCodes.Ok;
                case "merge":
                    return MergeCommand(rest, io);
                case "validate":
                    return Validate(rest, io);
                case "trace":
                    io.Err.Write(TracePointer);
                    return ExitCodes.Usage;
                case "report":
                    return Report(rest, io);
                default:
                    throw new UsageException(command is null ? "no command given" : $"unknown command {command}");
            }
        }
        catch (UsageException error)
        {
            io.Err.Write($"qualify: {error.Message}\n\n{Usage}");
            return ExitCodes.Usage;
        }
        catch (Exception error) when (error is InputException or ConfigurationException)
        {
            io.Err.Write($"qualify: {error.Message}\n");
            return ExitCodes.Invalid;
        }
    }

    private static int MergeCommand(List<string> args, ICliIO io)
    {
        var (values, positionals) = Options.Parse(args, ["allow-runs", "evidence-dir", "out"], []);
        if (positionals.Count > 0)
        {
            throw new UsageException($"merge takes no file arguments, got {string.Join(" ", positionals)}");
        }

        var allowRuns = values.TryGetValue("allow-runs", out var allow)
            ? allow.Split(',').Select(id => id.Trim()).Where(id => id.Length > 0).ToList()
            : [];
        foreach (var id in allowRuns.Where(id => !Ulid.IsValid(id)))
        {
            throw new UsageException($"--allow-runs: {id} is not a run ID");
        }

        var dir = PathOf(io, values.GetValueOrDefault("evidence-dir")
            ?? (io.Environment.TryGetValue("QUALIFY_EVIDENCE_DIR", out var fromEnv) && fromEnv.Length > 0 ? fromEnv : null)
            ?? SettingsResolver.DefaultEvidenceDir);
        var output = PathOf(io, values.GetValueOrDefault("out") ?? Path.Combine(dir, EvidenceFiles.RunFile));
        var recordsDir = Path.Combine(dir, EvidenceFiles.RecordsFolder);

        IReadOnlyList<MergeInput> inputs;
        try
        {
            inputs = io.ReadRecords(recordsDir);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw new InputException($"cannot read {recordsDir}: {error.Message}");
        }

        var result = EvidenceMerge.Build(inputs, allowRuns, () => EmptyEnvelope(io), io.Now());
        if (!result.Ok)
        {
            foreach (var error in result.Errors)
            {
                io.Err.Write($"qualify merge: {error}\n");
            }

            io.Err.Write("qualify merge: no run file written\n");
            return ExitCodes.Invalid;
        }

        var problems = EvidenceSchema.Problems(result.File);
        if (problems.Count > 0)
        {
            throw new InputException($"the merged run file is not valid: {string.Join("; ", problems)}");
        }

        var bytes = new UTF8Encoding(false).GetBytes(JsonText.Document(result.File, EvidenceShape.File));
        io.Writer.Write(output, bytes);
        io.Writer.Write(output + ".sha256", EvidenceFiles.Sidecar(bytes, Path.GetFileName(output)));
        var summary = result.File!["summary"]!;
        io.Out.Write(
            $"qualify merge: {summary["total"]} tests, {summary["pass"]} pass, {summary["fail"]} fail, {summary["error"]} error, {summary["skip"]} skip; verdict {summary["verdict"]}; wrote {output}\n");
        return result.ExitCode;
    }

    private static int Validate(List<string> args, ICliIO io)
    {
        var (_, files) = Options.Parse(args, [], []);
        if (files.Count == 0)
        {
            throw new UsageException("validate needs at least one file");
        }

        var invalid = 0;
        foreach (var file in files)
        {
            var problems = ValidateFile(io, file);
            if (problems.Count == 0)
            {
                io.Out.Write($"qualify validate: {file} is valid\n");
                continue;
            }

            invalid++;
            foreach (var problem in problems)
            {
                io.Err.Write($"qualify validate: {file}: {problem}\n");
            }
        }

        return invalid == 0 ? ExitCodes.Ok : ExitCodes.Invalid;
    }

    private static List<string> ValidateFile(ICliIO io, string file)
    {
        byte[] bytes;
        try
        {
            bytes = io.ReadBytes(PathOf(io, file));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            return [$"cannot read the file ({error.Message})"];
        }

        JsonNode? data;
        try
        {
            data = JsonNode.Parse(bytes);
        }
        catch (JsonException error)
        {
            return [$"not valid JSON ({error.Message})"];
        }

        var problems = EvidenceSchema.Problems(data).ToList();
        if (problems.Count == 0)
        {
            problems.AddRange(EvidenceSchema.LevelProblems(data));
        }

        return problems;
    }

    private static int Report(List<string> args, ICliIO io)
    {
        _ = Options.Parse(args, ["document-id", "map", "pdf", "protocol", "signatures", "title"], ["no-signatures"]);
        io.Err.Write("qualify report: the PDF report is not built yet in the .NET tool; use npx @lekman/qualify report\n");
        return ExitCodes.Usage;
    }

    /// <summary>The envelope of a run with no records, from this process's environment.</summary>
    private static JsonObject EmptyEnvelope(ICliIO io)
    {
        var settings = SettingsResolver.Resolve(io.Environment);
        var runId = io.Environment.TryGetValue("QUALIFY_RUN_ID", out var given) && Ulid.IsValid(given) ? given : Ulid.New();
        return RunEnvelope.Build(
            runId,
            settings.Environment,
            new ToolInfo(QualifyRuntime.ToolName, QualifyRuntime.ToolVersion, "csharp", $".NET {System.Environment.Version}; qualify merge"),
            io.Git.Read(io.WorkingDirectory),
            io.Environment,
            settings.ProductionWriteBlocked,
            settings.Overrides);
    }

    private static string PathOf(ICliIO io, string path) => Path.GetFullPath(path, io.WorkingDirectory);
}

/// <summary>A problem with how the command was called. Exit 64.</summary>
internal sealed class UsageException(string message) : Exception(message);

/// <summary>An input that cannot be used. Exit 2.</summary>
internal sealed class InputException(string message) : Exception(message);

/// <summary>Strict option parsing: <c>--name value</c>, <c>--name=value</c> and flags.</summary>
internal static class Options
{
    public static (Dictionary<string, string> Values, List<string> Positionals) Parse(
        IReadOnlyList<string> args,
        IReadOnlyCollection<string> valued,
        IReadOnlyCollection<string> flags)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        var positionals = new List<string>();
        for (var i = 0; i < args.Count; i++)
        {
            var arg = args[i];
            if (arg == "--")
            {
                positionals.AddRange(args.Skip(i + 1));
                break;
            }

            if (!arg.StartsWith("--", StringComparison.Ordinal) || arg.Length == 2)
            {
                positionals.Add(arg);
                continue;
            }

            var body = arg[2..];
            var equals = body.IndexOf('=', StringComparison.Ordinal);
            var name = equals < 0 ? body : body[..equals];
            if (flags.Contains(name))
            {
                if (equals >= 0)
                {
                    throw new UsageException($"option --{name} does not take a value");
                }

                values[name] = "true";
                continue;
            }

            if (!valued.Contains(name))
            {
                throw new UsageException($"unknown option {arg}");
            }

            if (equals >= 0)
            {
                values[name] = body[(equals + 1)..];
            }
            else if (i + 1 < args.Count && !args[i + 1].StartsWith("--", StringComparison.Ordinal))
            {
                values[name] = args[++i];
            }
            else
            {
                throw new UsageException($"option --{name} needs a value");
            }
        }

        return (values, positionals);
    }
}

/// <summary>The real process for the commands. System layer.</summary>
public sealed class SystemCliIO : ICliIO
{
    /// <inheritdoc />
    public IReadOnlyDictionary<string, string> Environment => SystemRuntime.Instance.Environment;

    /// <inheritdoc />
    public string WorkingDirectory => Directory.GetCurrentDirectory();

    /// <inheritdoc />
    public IGitProbe Git { get; } = new GitProbe();

    /// <inheritdoc />
    public IEvidenceWriter Writer { get; } = new AtomicFileWriter();

    /// <inheritdoc />
    public TextWriter Out => Console.Out;

    /// <inheritdoc />
    public TextWriter Err => Console.Error;

    /// <inheritdoc />
    public DateTimeOffset Now() => DateTimeOffset.UtcNow;

    /// <inheritdoc />
    public byte[] ReadBytes(string path) => File.ReadAllBytes(path);

    /// <inheritdoc />
    public IReadOnlyList<MergeInput> ReadRecords(string recordsDir) => MergeFiles.Read(recordsDir);
}
