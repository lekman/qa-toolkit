using System.Collections;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lekman.Qualify.Evidence;
using Xunit;

[assembly: Xunit.v3.Parallelization(Mode = Xunit.Sdk.ParallelMode.None)]

namespace Lekman.Qualify.Conformance.Harness;

/// <summary>The output and exit code of a child process.</summary>
public sealed record Exec(int Status, string Output);

/// <summary>
/// Runs scenarios the way spec/qualify/conformance/README.md describes:
/// real test classes through the real xUnit v3 runner in a child process,
/// then the qualify tool, masking, and a byte-for-byte comparison.
/// </summary>
public static partial class Harness
{
    /// <summary>The run ID every scenario uses.</summary>
    public const string RunId = "01HQA1ZQJ0C0NF0RMANCE00000";

    private const string Namespace = "Lekman.Qualify.Conformance.";

    /// <summary>The repository root.</summary>
    public static string Root { get; } = FindRoot();

    /// <summary>This package's folder.</summary>
    public static string Package => Path.Combine(Root, "packages", "qualify-dotnet");

    /// <summary>The shared expected files.</summary>
    public static string Expected => Path.Combine(Root, "spec", "qualify", "conformance", "expected");

    /// <summary>The fixtures of this harness.</summary>
    public static string Fixtures => Path.Combine(Package, "conformance", "fixtures");

    private static string Configuration { get; } =
        typeof(Harness).Assembly.GetCustomAttribute<AssemblyConfigurationAttribute>()?.Configuration ?? "Debug";

    /// <summary>A fresh evidence directory.</summary>
    public static string NewDirectory(string scenario) =>
        Directory.CreateTempSubdirectory($"qualify-{scenario}-").FullName;

    /// <summary>
    /// Run scenario test classes through the xUnit v3 runner with the
    /// conformance run ID, an evidence directory, and no other QUALIFY_* variable.
    /// </summary>
    public static Exec RunScenario(string dir, IEnumerable<string> classes, IDictionary<string, string>? env = null, params string[] extra)
    {
        var args = new List<string>();
        foreach (var name in classes)
        {
            args.Add("--filter-class");
            args.Add(Namespace + name);
        }

        args.AddRange(extra);
        return RunTests("Lekman.Qualify.Conformance", dir, env, [.. args]);
    }

    /// <summary>Run a built test application of this package in a child process.</summary>
    public static Exec RunTests(string project, string dir, IDictionary<string, string>? env, params string[] args)
    {
        var app = Path.Combine(Package, "conformance", project, "bin", Configuration, "net11.0", project);
        return Run(App(app), [.. args, "--no-ansi", "--progress", "off"], Package, ScenarioEnvironment(dir, env));
    }

    /// <summary>Run the qualify tool.</summary>
    public static Exec Tool(params string[] args)
    {
        var app = Path.Combine(Package, "src", "Lekman.Qualify.Tool", "bin", Configuration, "net11.0", "qualify");
        return Run(App(app), args, Package, ScenarioEnvironment(string.Empty, null));
    }

    /// <summary>Run the qualify tool with extra environment variables.</summary>
    public static Exec ToolWith(IDictionary<string, string> env, params string[] args)
    {
        var app = Path.Combine(Package, "src", "Lekman.Qualify.Tool", "bin", Configuration, "net11.0", "qualify");
        return Run(App(app), args, Package, ScenarioEnvironment(string.Empty, env));
    }

    /// <summary>Run <c>dotnet test</c> on a project of this package.</summary>
    public static Exec DotnetTest(string project, string dir, params string[] args) =>
        Run(
            "dotnet",
            ["test", "--project", Path.Combine("conformance", project), "--no-build", "--configuration", Configuration, .. args, "--no-ansi", "--progress", "off"],
            Package,
            ScenarioEnvironment(dir, null));

    /// <summary>Run the TypeScript CLI's <c>trace</c>, which the .NET tool points to.</summary>
    public static Exec TypeScriptTrace(params string[] args)
    {
        var cli = Path.Combine(Root, "packages", "qualify-ts", "dist", "cli.js");
        Assert.True(File.Exists(cli), $"{cli} is missing: run bun install and bun run build at the repository root first");
        return Run("node", [cli, "trace", .. args], Package, ScenarioEnvironment(string.Empty, null));
    }

    /// <summary>Merge with the qualify tool and check the exit code.</summary>
    public static (Exec Result, JsonObject? Run) Merge(string dir, int expected)
    {
        var result = Tool("merge", "--evidence-dir", dir);
        Assert.True(result.Status == expected, $"merge exited {result.Status}, expected {expected}\n{result.Output}");
        var path = Path.Combine(dir, EvidenceFiles.RunFile);
        if (!File.Exists(path))
        {
            return (result, null);
        }

        var valid = Tool("validate", path);
        Assert.True(valid.Status == 0, $"the run file is not valid: {valid.Output}");
        return (result, (JsonObject)JsonNode.Parse(File.ReadAllBytes(path))!);
    }

    /// <summary>Validate every record and marker with the qualify tool.</summary>
    public static void ValidateRecords(string dir)
    {
        var names = Records(dir);
        if (names.Count == 0)
        {
            return;
        }

        var result = Tool(["validate", .. names.Select(name => Path.Combine(dir, EvidenceFiles.RecordsFolder, name))]);
        Assert.True(result.Status == 0, $"a record is not valid:\n{result.Output}");
    }

    /// <summary>Record and marker names, without temporary files.</summary>
    public static List<string> Records(string dir)
    {
        var records = Path.Combine(dir, EvidenceFiles.RecordsFolder);
        return Directory.Exists(records)
            ? [.. Directory.EnumerateFiles(records).Select(Path.GetFileName).Where(n => !n!.StartsWith('.')).Select(n => n!)]
            : [];
    }

    /// <summary>Every site must point into one of the scenario's own test files.</summary>
    public static void CheckSites(JsonObject run, IReadOnlyCollection<string> classes)
    {
        foreach (var test in (JsonArray)run["tests"]!)
        {
            var sites = new List<string?> { (string?)test!["site"] };
            sites.AddRange(((JsonArray)test["checks"]!).Select(c => (string?)c!["site"]));
            sites.Add((string?)test["error"]?["site"]);
            foreach (var site in sites.Where(s => s is not null))
            {
                var match = SiteFile().Match(site!);
                Assert.True(match.Success && classes.Contains(match.Groups[1].Value), $"site {site} does not point into {string.Join(" or ", classes)}");
            }
        }
    }

    /// <summary>The masking table of the conformance README.</summary>
    public static JsonObject Mask(JsonObject file, string? errorType = null)
    {
        var copy = (JsonObject)file.DeepClone();
        var run = (JsonObject)copy["run"]!;
        run["startedAt"] = "<timestamp>";
        run["endedAt"] = "<timestamp>";
        run["tool"] = new JsonObject { ["name"] = "<tool>", ["version"] = "<version>", ["language"] = "<language>", ["runtime"] = "<runtime>" };
        run["source"] = new JsonObject { ["commit"] = null, ["branch"] = null, ["dirty"] = null };
        run["actor"] = new JsonObject { ["name"] = null, ["ci"] = null, ["ciRunUrl"] = null };
        run.Remove("selection");
        var tests = new JsonArray();
        foreach (var node in (JsonArray)copy["tests"]!)
        {
            var test = (JsonObject)node!.DeepClone();
            test["startedAt"] = "<timestamp>";
            test["endedAt"] = "<timestamp>";
            test["durationMs"] = 0;
            test["site"] = MaskSite((string)test["site"]!);
            foreach (var check in ((JsonArray)test["checks"]!).Cast<JsonObject>())
            {
                check["site"] = MaskSite((string)check["site"]!);
                check.Remove("at");
                if (check.ContainsKey("delegate"))
                {
                    check["delegate"] = "<function>";
                }
            }

            if (test["error"] is JsonObject error)
            {
                error["site"] = error["site"] is null ? null : MaskSite((string)error["site"]!);
                if (errorType is not null)
                {
                    error["type"] = errorType;
                }
            }

            tests.Add(MaskStrings(test));
        }

        copy["tests"] = tests;
        return copy;
    }

    /// <summary>The masking of a trace output: base names, no digests, no commits.</summary>
    public static JsonObject MaskTrace(JsonObject trace)
    {
        var copy = (JsonObject)trace.DeepClone();
        foreach (var input in ((JsonArray)copy["inputs"]!).Cast<JsonObject>())
        {
            input["path"] = Path.GetFileName((string)input["path"]!);
            input["sha256"] = "<sha256>";
        }

        foreach (var run in ((JsonArray)copy["runs"]!).Cast<JsonObject>())
        {
            run["commit"] = null;
        }

        return copy;
    }

    /// <summary>Compare a document with its expected file, byte for byte.</summary>
    public static void Compare(string name, string document)
    {
        var path = Path.Combine(Expected, name);
        Assert.True(File.Exists(path), $"expected file {name} is missing");
        var expected = File.ReadAllText(path, Encoding.UTF8);
        if (expected == document)
        {
            return;
        }

        var a = expected.Split('\n');
        var b = document.Split('\n');
        var line = Enumerable.Range(0, Math.Max(a.Length, b.Length)).First(i => i >= a.Length || i >= b.Length || a[i] != b[i]);
        Assert.Fail($"{name} differs at line {line + 1}:\n  expected: {(line < a.Length ? a[line] : "<end>")}\n  actual:   {(line < b.Length ? b[line] : "<end>")}");
    }

    /// <summary>A test of a run file by ID.</summary>
    public static JsonObject TestById(JsonObject? run, string id)
    {
        var test = ((JsonArray?)run?["tests"])?.Cast<JsonObject>().FirstOrDefault(t => (string?)t["id"] == id);
        Assert.True(test is not null, $"no record for {id}");
        return test!;
    }

    /// <summary>Every file below a directory.</summary>
    public static IEnumerable<string> FilesBelow(string dir) =>
        Directory.Exists(dir) ? Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories) : [];

    private static JsonNode? MaskStrings(JsonNode? node) => node switch
    {
        JsonValue value when value.GetValueKind() == System.Text.Json.JsonValueKind.String =>
            JsonValue.Create(Unserialisable().Replace(value.GetValue<string>(), "[unserialisable: <type>]")),
        JsonArray array => new JsonArray([.. array.Select(MaskStrings)]),
        JsonObject obj => new JsonObject(obj.Select(pair => KeyValuePair.Create(pair.Key, MaskStrings(pair.Value)))),
        _ => node?.DeepClone(),
    };

    private static string MaskSite(string site) => SiteShape().IsMatch(site) ? "<scenario>:0" : site;

    private static string App(string path) => OperatingSystem.IsWindows() ? path + ".exe" : path;

    private static Dictionary<string, string> ScenarioEnvironment(string dir, IDictionary<string, string>? extra)
    {
        var env = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
        {
            var key = (string)entry.Key;
            if (!key.StartsWith("QUALIFY_", StringComparison.Ordinal) && !key.StartsWith("TESTINGPLATFORM_", StringComparison.Ordinal))
            {
                env[key] = (string?)entry.Value ?? string.Empty;
            }
        }

        env["TESTINGPLATFORM_TELEMETRY_OPTOUT"] = "1";
        env["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        env["DOTNET_NOLOGO"] = "1";
        env["QUALIFY_RUN_ID"] = RunId;
        if (dir.Length > 0)
        {
            env["QUALIFY_EVIDENCE_DIR"] = dir;
        }

        foreach (var (key, value) in extra ?? new Dictionary<string, string>())
        {
            env[key] = value;
        }

        return env;
    }

    private static Exec Run(string file, IEnumerable<string> args, string cwd, Dictionary<string, string> env)
    {
        var start = new ProcessStartInfo(file)
        {
            WorkingDirectory = cwd,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        foreach (var arg in args)
        {
            start.ArgumentList.Add(arg);
        }

        start.Environment.Clear();
        foreach (var (key, value) in env)
        {
            start.Environment[key] = value;
        }

        using var process = Process.Start(start)!;
        var error = process.StandardError.ReadToEndAsync();
        var output = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        return new Exec(process.ExitCode, output + error.Result);
    }

    private static string FindRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "spec", "qualify", "conformance")))
            {
                return dir.FullName;
            }
        }

        throw new InvalidOperationException("cannot find the repository root above " + AppContext.BaseDirectory);
    }

    [GeneratedRegex(@"\[unserialisable: [^\]]*\]")]
    private static partial Regex Unserialisable();

    [GeneratedRegex(@"^.*:\d+$")]
    private static partial Regex SiteShape();

    [GeneratedRegex(@"^(?:.*/)?([^/]+?)\.cs:\d+$")]
    private static partial Regex SiteFile();
}
