using System.Text;
using System.Text.Json.Nodes;
using Lekman.Qualify.Cli;
using Lekman.Qualify.Envelope;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Merge;
using Lekman.Qualify.Schema;
using Lekman.Qualify.Values;
using Xunit;

namespace Lekman.Qualify.Tests;

/// <summary>Builds record and marker files for merge tests.</summary>
internal static class Records
{
    public const string RunId = "01HQA1ZQJ0C0NF0RMANCE00000";
    public const string OtherRun = "01HQA1ZQJ0C0NF0RMANCE00001";

    public static JsonObject Envelope(string runId = RunId, string environment = "local") =>
        RunEnvelope.Build(runId, environment, new ToolInfo("Lekman.Qualify", "0.1.0", "csharp", "r"), GitFacts.None, new Dictionary<string, string>(), false, []);

    public static JsonObject Test(string id, string outcome = "pass", string site = "t.cs:1", string started = "2026-01-02T03:04:05.006Z")
    {
        var test = new JsonObject
        {
            ["id"] = id,
            ["level"] = id[..2],
            ["title"] = "t",
            ["given"] = "g",
            ["when"] = "w",
            ["then"] = "t",
            ["scope"] = "read",
            ["requirements"] = new JsonArray(),
            ["tags"] = new JsonArray(),
            ["site"] = site,
            ["outcome"] = outcome,
        };
        if (outcome == "skip")
        {
            test["skipReason"] = "r";
        }

        if (outcome is "fail" or "error")
        {
            test["error"] = new JsonObject { ["type"] = "X", ["message"] = "m", ["site"] = null };
        }

        test["startedAt"] = started;
        test["endedAt"] = started;
        test["durationMs"] = 0;
        test["checks"] = new JsonArray();
        test["attachments"] = new JsonArray();
        test["secretsUsed"] = new JsonArray();
        return test;
    }

    public static MergeInput Record(string id, string outcome = "pass", string runId = RunId, string site = "t.cs:1", JsonObject? envelope = null, Action<JsonObject>? change = null)
    {
        var test = Test(id, outcome, site);
        change?.Invoke(test);
        var file = new JsonObject { ["schemaVersion"] = 1, ["kind"] = "record", ["run"] = envelope ?? Envelope(runId), ["test"] = test };
        return new MergeInput(EvidenceFiles.Record(runId, id, EvidenceFiles.Key(site)), JsonText.Document(file, EvidenceShape.File));
    }

    public static MergeInput Marker(string id, string runId = RunId, string site = "t.cs:1")
    {
        var test = Test(id, site: site);
        foreach (var key in new[] { "outcome", "endedAt", "durationMs", "checks", "attachments", "secretsUsed" })
        {
            test.Remove(key);
        }

        var file = new JsonObject { ["schemaVersion"] = 1, ["kind"] = "started", ["run"] = Envelope(runId), ["test"] = test };
        return new MergeInput(EvidenceFiles.Marker(runId, id, EvidenceFiles.Key(site)), JsonText.Document(file, EvidenceShape.File));
    }
}

public class MergeTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 3, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void RecordsBecomeOneSortedRunFile()
    {
        var result = EvidenceMerge.Build(
            [Records.Record("OQ-BETA-002", "fail"), Records.Marker("OQ-BETA-002"), Records.Record("IQ-ALPHA-001"), Records.Record("PQ-GAMMA-003", "skip"), new MergeInput(".tmp", "x")],
            [],
            () => Records.Envelope(),
            Now);
        Assert.True(result.Ok);
        Assert.Equal(1, result.ExitCode);
        var ids = ((JsonArray)result.File!["tests"]!).Select(t => (string)t!["id"]!);
        Assert.Equal(["IQ-ALPHA-001", "OQ-BETA-002", "PQ-GAMMA-003"], ids);
        Assert.Equal("{\"error\":0,\"fail\":1,\"pass\":1,\"skip\":1,\"total\":3,\"verdict\":\"fail\"}", JsonText.Compact(result.File["summary"]));
        Assert.Empty(EvidenceSchema.Problems(result.File));
    }

    [Fact]
    public void AMarkerWithoutARecordDidNotFinish()
    {
        var result = EvidenceMerge.Build([Records.Marker("OQ-CRASH-019")], [], () => Records.Envelope(), Now);
        var test = result.File!["tests"]![0]!;
        Assert.Equal("DidNotFinish", (string?)test["error"]!["type"]);
        Assert.Equal("test started and did not finish", (string?)test["error"]!["message"]);
        Assert.Equal(1, result.ExitCode);
    }

    [Fact]
    public void NoRecordsIsIncomplete()
    {
        var result = EvidenceMerge.Build([], [], () => Records.Envelope(), Now);
        Assert.Equal(3, result.ExitCode);
        Assert.Equal("2026-01-03T00:00:00.000Z", (string?)result.File!["run"]!["startedAt"]);
    }

    [Fact]
    public void OtherRunsNeedAllowRuns()
    {
        MergeInput[] inputs = [Records.Record("IQ-ALPHA-001"), Records.Record("IQ-BETA-002", runId: Records.OtherRun)];
        Assert.Contains("more than one run", EvidenceMerge.Build(inputs, [], () => Records.Envelope(), Now).Errors[0], StringComparison.Ordinal);
        var merged = EvidenceMerge.Build(inputs, [Records.OtherRun], () => Records.Envelope(), Now);
        Assert.Equal($"[\"{Records.OtherRun}\"]", JsonText.Compact(merged.File!["run"]!["mergedRuns"]));
        Assert.Contains("leave the main run out", EvidenceMerge.Build(inputs, [Records.RunId, Records.OtherRun], () => Records.Envelope(), Now).Errors[0], StringComparison.Ordinal);
    }

    [Fact]
    public void InvalidInputsAreRefused()
    {
        Assert.Contains("not a record or marker name", Single(new MergeInput("x.json", "{}")), StringComparison.Ordinal);
        Assert.Contains("not valid JSON", Single(new MergeInput(EvidenceFiles.Record(Records.RunId, "IQ-ALPHA-001", "00000000"), "{")), StringComparison.Ordinal);
        Assert.Contains("kind", Single(new MergeInput(EvidenceFiles.Record(Records.RunId, "IQ-ALPHA-001", "00000000"), "{}")), StringComparison.Ordinal);
        var marker = Records.Marker("IQ-ALPHA-001");
        Assert.Contains("holds a started file", Single(new MergeInput(marker.Name.Replace(".started", ".json", StringComparison.Ordinal), marker.Text)), StringComparison.Ordinal);
        var record = Records.Record("IQ-ALPHA-001");
        Assert.Contains("does not match run", Single(new MergeInput(record.Name.Replace("IQ-ALPHA-001", "IQ-OTHER-001", StringComparison.Ordinal), record.Text)), StringComparison.Ordinal);
        Assert.Contains("does not match its level", Single(Records.Record("IQ-ALPHA-001", change: t => t["level"] = "OQ")), StringComparison.Ordinal);
    }

    [Fact]
    public void DuplicatesAndDisagreementsAreRefused()
    {
        var duplicate = EvidenceMerge.Build([Records.Record("OQ-DUP-018", site: "a.cs:1"), Records.Record("OQ-DUP-018", site: "b.cs:1")], [], () => Records.Envelope(), Now);
        Assert.Contains("OQ-DUP-018 appears 2 times", duplicate.Errors[0], StringComparison.Ordinal);
        var disagree = EvidenceMerge.Build([Records.Record("IQ-ALPHA-001"), Records.Record("IQ-BETA-002", envelope: Records.Envelope(environment: "prod"))], [], () => Records.Envelope(), Now);
        Assert.Contains("disagree on environment", disagree.Errors[0], StringComparison.Ordinal);
        Assert.Equal(2, disagree.ExitCode);
    }

    [Fact]
    public void MergeAppliesThePatternsAgain()
    {
        var shape = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
        var result = EvidenceMerge.Build(
            [Records.Record("IQ-ALPHA-001", change: t =>
            {
                t["title"] = "key " + shape;
                var bytes = Encoding.ASCII.GetBytes(shape);
                t["attachments"] = new JsonArray(new JsonObject
                {
                    ["filename"] = "k.txt",
                    ["contentType"] = "text/plain",
                    ["encoding"] = "base64",
                    ["content"] = Convert.ToBase64String(bytes),
                    ["sizeBytes"] = bytes.Length,
                    ["sha256"] = EvidenceFiles.Sha256(bytes),
                }, new JsonObject
                {
                    ["filename"] = "ok.txt",
                    ["contentType"] = "text/plain",
                    ["encoding"] = "base64",
                    ["content"] = "b2s=",
                    ["sizeBytes"] = 2,
                    ["sha256"] = EvidenceFiles.Sha256("ok"u8.ToArray()),
                });
            })],
            [],
            () => Records.Envelope(),
            Now);
        var test = result.File!["tests"]![0]!;
        Assert.Equal("key [REDACTED]", (string?)test["title"]);
        Assert.Equal("[REDACTED]", Encoding.ASCII.GetString(Convert.FromBase64String((string)test["attachments"]![0]!["content"]!)));
        Assert.Equal(10L, (long)test["attachments"]![0]!["sizeBytes"]!);
    }

    [Fact]
    public void MergeFilesReadsADirectory()
    {
        var dir = Directory.CreateTempSubdirectory("qualify-merge-").FullName;
        try
        {
            Assert.Empty(MergeFiles.Read(Path.Combine(dir, "missing")));
            File.WriteAllText(Path.Combine(dir, "a.json"), "x");
            File.WriteAllText(Path.Combine(dir, ".tmp"), "y");
            Assert.Equal([new MergeInput("a.json", "x")], MergeFiles.Read(dir));
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    private static string Single(MergeInput input)
    {
        var result = EvidenceMerge.Build([input], [], () => Records.Envelope(), Now);
        Assert.False(result.Ok);
        Assert.Equal(2, result.ExitCode);
        return string.Join("\n", result.Errors);
    }
}

public class CommandTests
{
    [Fact]
    public void MergeWritesTheRunFileAndItsDigest()
    {
        var io = new MemoryIO();
        io.Variables["QUALIFY_EVIDENCE_DIR"] = "/ev";
        foreach (var input in new[] { Records.Record("IQ-ALPHA-001"), Records.Marker("IQ-ALPHA-001") })
        {
            io.Disk[$"/ev/records/{input.Name}"] = Encoding.UTF8.GetBytes(input.Text);
        }

        Assert.Equal(0, QualifyCommands.Run(["merge"], io));
        var run = io.Files.Text("/ev/test-evidence.json");
        Assert.Equal($"{EvidenceFiles.Sha256(Encoding.UTF8.GetBytes(run))}  test-evidence.json\n", io.Files.Text("/ev/test-evidence.json.sha256"));
        Assert.Contains("verdict pass", io.Output.ToString(), StringComparison.Ordinal);

        Assert.Equal(0, QualifyCommands.Run(["merge", "--evidence-dir", "/ev", "--out=/out/run.json", "--allow-runs", Records.OtherRun], io));
        Assert.True(io.Files.Files.ContainsKey("/out/run.json"));
    }

    [Fact]
    public void MergeReportsInvalidInputAndEmptyRuns()
    {
        var io = new MemoryIO();
        io.Disk["/work/qualification/evidence/records/bad.json"] = "{}"u8.ToArray();
        Assert.Equal(2, QualifyCommands.Run(["merge"], io));
        Assert.Contains("no run file written", io.Errors.ToString(), StringComparison.Ordinal);

        var empty = new MemoryIO();
        empty.Variables["QUALIFY_RUN_ID"] = Records.RunId;
        Assert.Equal(3, QualifyCommands.Run(["merge", "--evidence-dir", "/none"], empty));
        Assert.Contains(Records.RunId, empty.Files.Text("/none/test-evidence.json"), StringComparison.Ordinal);
    }

    [Fact]
    public void ValidateChecksEachFile()
    {
        var io = new MemoryIO();
        var record = Records.Record("IQ-ALPHA-001");
        io.Disk["/work/good.json"] = Encoding.UTF8.GetBytes(record.Text);
        io.Disk["/work/bad.json"] = "{"u8.ToArray();
        io.Disk["/work/level.json"] = Encoding.UTF8.GetBytes(Records.Record("IQ-ALPHA-001", change: t => t["level"] = "OQ").Text);
        Assert.Equal(0, QualifyCommands.Run(["validate", "good.json"], io));
        Assert.Equal(2, QualifyCommands.Run(["validate", "good.json", "bad.json", "level.json", "missing.json"], io));
        var errors = io.Errors.ToString();
        Assert.Contains("not valid JSON", errors, StringComparison.Ordinal);
        Assert.Contains("does not match its level", errors, StringComparison.Ordinal);
        Assert.Contains("cannot read", errors, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(new string[0], "no command given")]
    [InlineData(new[] { "nope" }, "unknown command nope")]
    [InlineData(new[] { "merge", "file" }, "takes no file arguments")]
    [InlineData(new[] { "merge", "--allow-runs", "x" }, "is not a run ID")]
    [InlineData(new[] { "merge", "--bogus" }, "unknown option --bogus")]
    [InlineData(new[] { "merge", "--out" }, "needs a value")]
    [InlineData(new[] { "validate" }, "at least one file")]
    [InlineData(new[] { "report" }, "exactly one run file")]
    [InlineData(new[] { "report", "r.json" }, "needs --pdf")]
    [InlineData(new[] { "report", "r.json", "--pdf", "o.pdf", "--signatures", "A", "--no-signatures" }, "exclude each other")]
    [InlineData(new[] { "report", "r.json", "--pdf", "o.pdf", "--signatures", " ; " }, "names no role")]
    [InlineData(new[] { "report", "r.json", "--pdf", "o.pdf", "--title", " " }, "must not be empty")]
    [InlineData(new[] { "report", "r.json", "--pdf", "o.pdf", "--no-signatures=yes" }, "does not take a value")]
    public void UsageErrorsExit64(string[] args, string message)
    {
        var io = new MemoryIO();
        Assert.Equal(64, QualifyCommands.Run(args, io));
        Assert.Contains(message, io.Errors.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void HelpVersionAndTrace()
    {
        var io = new MemoryIO();
        Assert.Equal(0, QualifyCommands.Run(["--help"], io));
        Assert.Contains("Usage:", io.Output.ToString(), StringComparison.Ordinal);
        Assert.Equal(0, QualifyCommands.Run(["--version"], io));
        Assert.Contains("0.1.0", io.Output.ToString(), StringComparison.Ordinal);
        Assert.Equal(64, QualifyCommands.Run(["trace", "run.json"], io));
        Assert.Contains("npx @lekman/qualify trace", io.Errors.ToString(), StringComparison.Ordinal);
        Assert.Equal(2, QualifyCommands.Run(["merge", "--evidence-dir", "/x"], new MemoryIO { Variables = { ["QUALIFY_ATTACHMENT_LIMIT"] = "bad" } }));
    }
}
