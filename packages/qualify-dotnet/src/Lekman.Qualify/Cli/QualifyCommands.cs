using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lekman.Qualify.Envelope;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Execution;
using Lekman.Qualify.Merge;
using Lekman.Qualify.Report;
using Lekman.Qualify.Schema;
using Lekman.Qualify.Settings;
using Lekman.Qualify.Theme;
using Lekman.Qualify.Trace;
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
public static partial class QualifyCommands
{
    /// <summary>The usage text.</summary>
    public const string Usage = """
        Usage:
          qualify merge    [--evidence-dir DIR] [--allow-runs ID,ID] [--out FILE]
          qualify validate FILE...
          qualify report   RUNFILE --pdf FILE [--protocol protocol.yaml] [--map trace.yaml]
                           [--theme NAME|PATH] [--title TEXT] [--subtitle TEXT]
                           [--document-id TEXT] [--classification TEXT]
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
        var (values, positionals) = Options.Parse(
            args,
            ["classification", "document-id", "map", "pdf", "protocol", "signatures", "subtitle", "theme", "title"],
            ["no-signatures"]);
        if (positionals.Count != 1)
        {
            throw new UsageException("report takes exactly one run file");
        }

        if (!values.TryGetValue("pdf", out var pdf))
        {
            throw new UsageException("report needs --pdf FILE");
        }

        var noSignatures = values.ContainsKey("no-signatures");
        if (noSignatures && values.ContainsKey("signatures"))
        {
            throw new UsageException("--signatures and --no-signatures exclude each other");
        }

        IReadOnlyList<string>? signatures = null;
        if (noSignatures)
        {
            signatures = [];
        }
        else if (values.TryGetValue("signatures", out var roles))
        {
            signatures = [.. roles.Split(';').Select(r => r.Trim()).Where(r => r.Length > 0)];
            if (signatures.Count == 0)
            {
                throw new UsageException("--signatures names no role");
            }
        }

        foreach (var flag in new[] { "title", "document-id", "theme" })
        {
            if (values.TryGetValue(flag, out var value) && value.Trim().Length == 0)
            {
                throw new UsageException($"--{flag} must not be empty");
            }
        }

        var generatedAt = ReportTime(io);
        var reference = values.GetValueOrDefault("theme")
            ?? (io.Environment.TryGetValue("QUALIFY_REPORT_THEME", out var fromEnv) && fromEnv.Length > 0 ? fromEnv : null)
            ?? BundledThemes.Default;
        ReportTheme theme;
        try
        {
            theme = ThemeLoader.Load(reference, io.WorkingDirectory, new ThemeFiles(io));
        }
        catch (ThemeException error)
        {
            throw new InputException(error.Message);
        }

        var (run, digest) = RunFile(io, positionals[0]);
        IReadOnlyList<ProtocolEntry>? protocol = null;
        IReadOnlyDictionary<string, IReadOnlyList<string>>? map = null;
        try
        {
            if (values.TryGetValue("protocol", out var protocolPath))
            {
                protocol = TraceMatrix.Protocol(Encoding.UTF8.GetString(Read(io, protocolPath)), protocolPath);
            }

            if (values.TryGetValue("map", out var mapPath))
            {
                map = TraceMatrix.Map(Encoding.UTF8.GetString(Read(io, mapPath)), mapPath);
            }
        }
        catch (TraceInputException error)
        {
            throw new InputException(error.Message);
        }

        var document = ReportContent.Build(new ReportInput
        {
            Run = run,
            Digest = digest,
            Trace = TraceMatrix.Build(run, protocol, map),
            Theme = theme.Spec,
            Producer = $"{QualifyRuntime.ToolName} {QualifyRuntime.ToolVersion}",
            Options = new ReportOptions
            {
                GeneratedAt = generatedAt,
                Title = values.GetValueOrDefault("title"),
                Subtitle = values.GetValueOrDefault("subtitle"),
                DocumentId = values.GetValueOrDefault("document-id"),
                Classification = values.GetValueOrDefault("classification"),
                SignaturesGiven = signatures is not null,
                Signatures = signatures ?? [],
            },
        });
        var bytes = PdfReportRenderer.Render(document, theme);
        var output = PathOf(io, pdf);
        io.Writer.Write(output, bytes);
        io.Out.Write($"qualify report: wrote {output} with theme {theme.Spec.Name}; run verdict {run["summary"]!["verdict"]}\n");
        return ExitCodes.Ok;
    }

    /// <summary>The generation time: <c>QUALIFY_REPORT_TIME</c> when set, else now.</summary>
    private static DateTimeOffset ReportTime(ICliIO io)
    {
        if (!io.Environment.TryGetValue("QUALIFY_REPORT_TIME", out var value) || value.Length == 0)
        {
            return io.Now();
        }

        if (!ReportTimeRegex().IsMatch(value) ||
            !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var time))
        {
            throw new InputException($"QUALIFY_REPORT_TIME must be a UTC instant such as 2026-01-02T03:04:05.006Z, got {value}");
        }

        return time;
    }

    /// <summary>Read a run file: its validated content and the digest of its bytes, checking a <c>.sha256</c> sidecar when there is one.</summary>
    private static (JsonObject Run, string Digest) RunFile(ICliIO io, string path)
    {
        var bytes = Read(io, path);
        var digest = EvidenceFiles.Sha256(bytes);
        byte[]? sidecar = null;
        try
        {
            sidecar = io.ReadBytes(PathOf(io, path) + ".sha256");
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            // No sidecar: nothing to check.
        }

        if (sidecar is not null)
        {
            var recorded = Encoding.UTF8.GetString(sidecar).Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (recorded != digest)
            {
                throw new InputException($"{path}: the SHA-256 does not match {path}.sha256");
            }
        }

        JsonNode? data;
        try
        {
            data = JsonNode.Parse(bytes);
        }
        catch (JsonException error)
        {
            throw new InputException($"{path}: not valid JSON ({error.Message})");
        }

        var problems = EvidenceSchema.Problems(data);
        if (problems.Count > 0)
        {
            throw new InputException($"{path}: {string.Join("; ", problems)}");
        }

        if ((string?)data!["kind"] != "run")
        {
            throw new InputException($"{path}: expected a run file; run qualify merge first");
        }

        return ((JsonObject)data, digest);
    }

    private static byte[] Read(ICliIO io, string path)
    {
        try
        {
            return io.ReadBytes(PathOf(io, path));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            throw new InputException($"cannot read {path}: {error.Message}");
        }
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

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")]
    private static partial Regex ReportTimeRegex();

    private sealed class ThemeFiles(ICliIO io) : IThemeFiles
    {
        public byte[] ReadBytes(string path) => io.ReadBytes(path);
    }
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
