using System.Text;
using System.Text.Json.Nodes;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Values;
using Xunit;

namespace Lekman.Qualify.Conformance.Harness;

/// <summary>
/// The scenarios of spec/qualify/conformance/README.md, one test each,
/// numbered as the README numbers them. Scenario 21 (the PDF report) is not
/// here yet.
/// </summary>
public class ScenarioTests
{
    private const string Secret = "s3cr3t-value-123";

    private static readonly JsonShape TraceShape = JsonShape.Ordered(
        ["schemaVersion", "kind", "inputs", "runs", "summary", "rows", "notRun", "requirementsWithoutPass"],
        new Dictionary<string, JsonShape>
        {
            ["inputs"] = JsonShape.ArrayOf(JsonShape.Ordered(["path", "role", "sha256"])),
            ["runs"] = JsonShape.ArrayOf(JsonShape.Ordered(["id", "environment", "commit", "verdict"])),
            ["summary"] = JsonShape.Ordered(
                ["tests", "pass", "fail", "error", "skip", "notRun", "requirements", "requirementsWithoutPass", "verdict"]),
            ["rows"] = JsonShape.ArrayOf(JsonShape.Ordered(
                ["requirement", "sources", "testId", "level", "title", "risk", "controls", "outcome", "run", "environment"])),
        });

    [Fact]
    public void Scenario01AllPass() =>
        Scenario("all-pass", ["AllPassTests"], status: 0, merge: 0, trace: 0);

    [Fact]
    public void Scenario02FailingCheckStops() =>
        Scenario("failing-check-stops", ["FailingCheckStopsTests"], status: 2, merge: 1, trace: 1);

    [Fact]
    public void Scenario03SoftCheck() =>
        Scenario("soft-check", ["SoftCheckTests"], status: 2, merge: 1);

    [Fact]
    public void Scenario04ThrownError() =>
        Scenario("thrown-error", ["ThrownErrorTests"], status: 2, merge: 1, errorType: "<runtime error>", check: (_, run, _) =>
            Assert.Equal("InvalidOperationException", (string?)Harness.TestById(run, "OQ-CONF-004")["error"]!["type"]));

    [Fact]
    public void Scenario05PlainAssertion() =>
        Scenario("plain-assertion", ["PlainAssertionTests"], status: 2, merge: 1, errorType: "<assertion error>", check: (_, run, _) =>
            Assert.Equal("FailException", (string?)Harness.TestById(run, "OQ-CONF-005")["error"]!["type"]));

    [Fact]
    public void Scenario06RuntimeSkip() =>
        Scenario("runtime-skip", ["RuntimeSkipTests"], status: 0, merge: 0, trace: 0, check: (_, _, output) =>
            Assert.Contains("skipped: 1", output, StringComparison.Ordinal));

    [Fact]
    public void Scenario07PolicySkipA() =>
        Scenario(
            "policy-skip.a",
            ["PolicySkipTests"],
            status: 0,
            merge: 0,
            env: new Dictionary<string, string> { ["QUALIFY_ENVIRONMENT"] = "production" },
            check: (_, _, output) => Assert.Contains("skipped: 1", output, StringComparison.Ordinal));

    [Fact]
    public void Scenario07PolicySkipB() =>
        Scenario(
            "policy-skip.b",
            ["PolicySkipTests"],
            status: 0,
            merge: 0,
            env: new Dictionary<string, string>
            {
                ["QUALIFY_ENVIRONMENT"] = "production",
                ["QUALIFY_ALLOW_WRITE"] = "OQ-CONF-007=conformance override",
            });

    [Fact]
    public void Scenario08MissingScope() =>
        DeclarationError("missing-scope", ["MissingScopeTests"], [("OQ-CONF-008", "scope")]);

    [Fact]
    public void Scenario09BadId() =>
        DeclarationError("bad-id", ["BadIdTests"], [("OQ-conf-009", "pattern"), ("IQ-CONF-010", "level")]);

    [Fact]
    public void Scenario10SecretRedaction() =>
        Scenario(
            "secret-redaction",
            ["SecretRedactionTests"],
            status: 2,
            merge: 1,
            errorType: "<runtime error>",
            env: new Dictionary<string, string> { ["QUALIFY_SECRET_CONFORMANCE_TOKEN"] = Secret },
            check: (dir, run, output) =>
            {
                var secret = Encoding.UTF8.GetBytes(Secret);
                foreach (var path in Harness.FilesBelow(dir))
                {
                    Assert.False(File.ReadAllBytes(path).AsSpan().IndexOf(secret) >= 0, $"{Path.GetFileName(path)} holds the secret");
                }

                Assert.DoesNotContain(Secret, output, StringComparison.Ordinal);
                var test = Harness.TestById(run, "OQ-CONF-011");
                var attachments = ((JsonArray)test["attachments"]!).Cast<JsonObject>().ToList();
                var json = JsonNode.Parse(Convert.FromBase64String((string)attachments.Single(a => (string?)a["filename"] == "request.json")["content"]!));
                Assert.Equal("{\"note\":\"x [REDACTED]\",\"token\":\"[REDACTED]\",\"url\":\"/x\"}", JsonText.Compact(json));
                var raw = Convert.FromBase64String((string)attachments.Single(a => (string?)a["filename"] == "raw.bin")["content"]!);
                Assert.Equal([0x00, 0xFF, .. "[REDACTED]"u8.ToArray(), 0x00], raw);
                Assert.Equal("failed with [REDACTED]", (string?)test["error"]!["message"]);
                Assert.Equal("InvalidOperationException", (string?)test["error"]!["type"]);
            });

    [Fact]
    public void Scenario11PatternRedaction() =>
        Scenario("pattern-redaction", ["PatternRedactionTests"], status: 0, merge: 0, check: (dir, _, _) =>
        {
            string[] shapes = ["AK" + "IA" + "ABCDEFGHIJKLMNOP", "eyJhbGciOiJIUzI1NiJ9" + ".eyJ", "BEGIN PRIVATE" + " KEY"];
            foreach (var path in Harness.FilesBelow(dir))
            {
                var text = File.ReadAllText(path);
                Assert.False(shapes.Any(shape => text.Contains(shape, StringComparison.Ordinal)), $"{Path.GetFileName(path)} holds a secret shape");
            }
        });

    [Fact]
    public void Scenario12SeveralRequirements() =>
        Scenario("several-requirements", ["SeveralRequirementsTests"], status: 0, merge: 0, check: (dir, run, _) =>
        {
            Assert.Equal("[\"REQ-1\",\"REQ-2\"]", JsonText.Compact(Harness.TestById(run, "OQ-CONF-013")["requirements"]));
            var (status, trace) = TraceWith(dir, ["--map", Path.Combine(Harness.Fixtures, "several-requirements.trace.yaml")], "several-requirements.trace.json");
            Assert.Equal(0, status);
            var rows = ((JsonArray)trace["rows"]!).Where(r => (string?)r!["testId"] == "OQ-CONF-013")
                .Select(r => $"{r!["requirement"]}:{JsonText.Compact(r["sources"])}");
            Assert.Equal(["REQ-1:[\"code\"]", "REQ-2:[\"code\"]", "REQ-3:[\"map\"]"], rows);
        });

    [Fact]
    public void Scenario13Narrative() =>
        Scenario("narrative", ["NarrativeTests"], status: 0, merge: 0, check: (_, run, _) =>
        {
            var test = Harness.TestById(run, "PQ-CONF-014");
            Assert.Equal("données d’entrée — 入力", (string?)test["given"]);
            Assert.Equal("the run 🚀 starts", (string?)test["when"]);
            Assert.Equal("“quoted” output", (string?)test["then"]);
            Assert.Equal("[\"first\",\"second\",\"third — 3\"]", JsonText.Compact(test["and"]));
        });

    [Fact]
    public void Scenario14Attachments()
    {
        var dir = Harness.NewDirectory("attachments");
        try
        {
            // The limit would stop OQ-CONF-015 too, so each test runs alone,
            // selected by ID through its display name.
            var first = Harness.RunScenario(dir, ["AttachmentsTests"], null, "--filter-display-name", "[OQ-CONF-015]*");
            Assert.True(first.Status == 0, first.Output);
            var second = Harness.RunScenario(
                dir,
                ["AttachmentsTests"],
                new Dictionary<string, string> { ["QUALIFY_ATTACHMENT_LIMIT"] = "16" },
                "--filter-display-name",
                "[OQ-CONF-016]*");
            Assert.True(second.Status == 2, second.Output);
            Finish("attachments", dir, ["AttachmentsTests"], merge: 1, trace: null, errorType: null, output: first.Output + second.Output, check: (_, run, _) =>
            {
                var passed = Harness.TestById(run, "OQ-CONF-015");
                var files = ((JsonArray)passed["attachments"]!).Cast<JsonObject>().ToDictionary(a => (string)a["filename"]!);
                Assert.Equal(6, (int)files["note.txt"]["sizeBytes"]!);
                Assert.Equal(EvidenceFiles.Sha256("hello\n"u8.ToArray()), (string?)files["note.txt"]["sha256"]);
                Assert.Equal(256, (int)files["blob.bin"]["sizeBytes"]!);
                Assert.Equal(EvidenceFiles.Sha256([.. Enumerable.Range(0, 256).Select(i => (byte)i)]), (string?)files["blob.bin"]["sha256"]);
                var big = Harness.TestById(run, "OQ-CONF-016");
                Assert.Equal("AttachmentTooLarge", (string?)big["error"]!["type"]);
                Assert.Empty((JsonArray)big["attachments"]!);
            });
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void Scenario15ValueNormalisation() =>
        Scenario("value-normalisation", ["ValueNormalisationTests"], status: 0, merge: 0);

    [Fact]
    public void Scenario16ParallelDeterminism()
    {
        string[] classes = ["AllPassTests", "FailingCheckStopsTests", "NarrativeTests"];
        var documents = new List<string>();
        for (var round = 0; round < 2; round++)
        {
            var dir = Harness.NewDirectory("parallel");
            var log = Path.Combine(Path.GetTempPath(), $"qualify-workers-{Guid.NewGuid():N}.log");
            try
            {
                var result = Harness.RunScenario(
                    dir,
                    classes,
                    new Dictionary<string, string> { ["CONFORMANCE_WORKER_LOG"] = log },
                    "--parallel",
                    "collections",
                    "--max-threads",
                    "2");
                Assert.True(result.Status == 2, result.Output);
                var workers = File.ReadAllLines(log).Distinct(StringComparer.Ordinal).Count();
                Assert.True(workers >= 2, $"ran on {workers} thread, expected at least 2");
                var (_, run) = Harness.Merge(dir, 1);
                Harness.CheckSites(run!, classes);
                documents.Add(JsonText.Document(Harness.Mask(run!), EvidenceShape.File));
            }
            finally
            {
                Directory.Delete(dir, recursive: true);
                File.Delete(log);
            }
        }

        Assert.Equal(documents[0], documents[1]);
        Harness.Compare("parallel-determinism.json", documents[0]);
    }

    [Fact]
    public void Scenario17DuplicateId()
    {
        var dir = Harness.NewDirectory("duplicate-id");
        try
        {
            var result = Harness.RunScenario(dir, ["DuplicateIdATests", "DuplicateIdBTests"]);
            Assert.True(result.Status == 0, result.Output);
            Harness.ValidateRecords(dir);
            var (merge, run) = Harness.Merge(dir, 2);
            Assert.Contains("OQ-CONF-018", merge.Output, StringComparison.Ordinal);
            Assert.Null(run);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void Scenario18Crash() =>
        Scenario("crash", ["CrashTests"], status: null, merge: 1, trace: 1, check: (_, run, _) =>
            Assert.Equal("DidNotFinish", (string?)Harness.TestById(run, "OQ-CONF-019")["error"]!["type"]));

    [Fact]
    public void Scenario19Deselected() =>
        Scenario(
            "deselected",
            ["DeselectedTests"],
            status: 0,
            merge: 0,
            extra: ["--filter-display-name", "[OQ-CONF-020]*"],
            check: (dir, run, _) =>
            {
                Assert.Single((JsonArray)run!["tests"]!);
                var (status, trace) = TraceWith(dir, ["--protocol", Path.Combine(Harness.Fixtures, "deselected.protocol.yaml")], "deselected.trace.json");
                Assert.Equal(3, status);
                Assert.Equal("[\"OQ-CONF-021\"]", JsonText.Compact(trace["notRun"]));
                Assert.Contains((JsonArray)trace["rows"]!, r => (string?)r!["testId"] == "OQ-CONF-021" && (string?)r["outcome"] == "not-run");
            });

    [Fact]
    public void Scenario20ControlPair() =>
        Scenario("control-pair", ["ControlPairTests"], status: 0, merge: 0, check: (dir, run, _) =>
        {
            Assert.Equal("OQ-CONF-022", (string?)Harness.TestById(run, "OQ-CONF-023")["controls"]);
            var (_, trace) = TraceWith(dir, [], "control-pair.trace.json");
            var rows = ((JsonArray)trace["rows"]!).Select(r => (string?)r!["testId"]).ToList();
            var at = rows.IndexOf("OQ-CONF-022");
            Assert.True(at >= 0 && at + 1 < rows.Count && rows[at + 1] == "OQ-CONF-023", "the pair is not on adjacent rows");
        });

    /// <summary>
    /// Run one scenario: the runner's exit code (null for a crash), merge and
    /// its exit code, the trace exit code where the README lists one, the
    /// scenario's own checks, then the masked comparison.
    /// </summary>
    private static void Scenario(
        string name,
        string[] classes,
        int? status,
        int merge,
        int? trace = null,
        string? errorType = null,
        Dictionary<string, string>? env = null,
        string[]? extra = null,
        Action<string, JsonObject?, string>? check = null)
    {
        var dir = Harness.NewDirectory(name);
        try
        {
            var result = Harness.RunScenario(dir, classes, env, extra ?? []);
            if (status is null)
            {
                Assert.True(result.Status != 0, $"the runner exited 0, expected a crash\n{result.Output}");
            }
            else
            {
                Assert.True(result.Status == status, $"the runner exited {result.Status}, expected {status}\n{result.Output}");
            }

            Finish(name, dir, classes, merge, trace, errorType, result.Output, check);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    private static void Finish(
        string name,
        string dir,
        string[] classes,
        int merge,
        int? trace,
        string? errorType,
        string output,
        Action<string, JsonObject?, string>? check)
    {
        Harness.ValidateRecords(dir);
        var (mergeResult, run) = Harness.Merge(dir, merge);
        Assert.NotNull(run);
        Harness.CheckSites(run!, classes);
        if (trace is not null)
        {
            var result = Harness.TypeScriptTrace(Path.Combine(dir, EvidenceFiles.RunFile), "--json", Path.Combine(dir, "exit.trace.json"));
            Assert.True(result.Status == trace, $"trace exited {result.Status}, expected {trace}\n{result.Output}");
        }

        check?.Invoke(dir, run, output + mergeResult.Output);
        Harness.Compare(name + ".json", JsonText.Document(Harness.Mask(run!, errorType), EvidenceShape.File));
    }

    private static void DeclarationError(string name, string[] classes, (string Id, string Word)[] expectations)
    {
        var dir = Harness.NewDirectory(name);
        try
        {
            var result = Harness.RunScenario(dir, classes);
            Assert.True(result.Status != 0, $"the runner exited 0, expected a declaration failure\n{result.Output}");
            Assert.Empty(Harness.Records(dir));
            foreach (var (id, word) in expectations)
            {
                Assert.True(
                    result.Output.Split('\n').Any(line => line.Contains(id, StringComparison.Ordinal) && line.Contains(word, StringComparison.Ordinal)),
                    $"the runner output does not name {id} with \"{word}\"\n{result.Output}");
            }
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    private static (int Status, JsonObject Trace) TraceWith(string dir, string[] args, string expected)
    {
        var json = Path.Combine(dir, "trace.json");
        var result = Harness.TypeScriptTrace([Path.Combine(dir, EvidenceFiles.RunFile), .. args, "--json", json, "--md", Path.Combine(dir, "trace.md")]);
        Assert.True(File.Exists(json), $"trace wrote no trace.json: {result.Output}");
        var trace = (JsonObject)JsonNode.Parse(File.ReadAllBytes(json))!;
        Harness.Compare(expected, JsonText.Document(Harness.MaskTrace(trace), TraceShape));
        return (result.Status, trace);
    }
}
