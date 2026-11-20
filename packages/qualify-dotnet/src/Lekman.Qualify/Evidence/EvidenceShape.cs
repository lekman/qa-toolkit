using Lekman.Qualify.Values;

namespace Lekman.Qualify.Evidence;

/// <summary>
/// Key order of every evidence file: the order properties appear in
/// <c>evidence.schema.json</c>. Values inside <c>expected</c>, <c>actual</c>
/// and <c>target</c> have no shape, so their keys are sorted.
/// </summary>
public static class EvidenceShape
{
    private static readonly string[] DeclarationKeys =
        ["id", "level", "title", "given", "when", "then", "and", "scope", "requirements", "risk", "tags", "controls", "site"];

    private static readonly JsonShape Check = JsonShape.Ordered(
        ["seq", "context", "description", "matcher", "expected", "actual", "pass", "soft", "site", "delegate", "at"]);

    private static readonly JsonShape Test = JsonShape.Ordered(
        [.. DeclarationKeys, "outcome", "skipReason", "error", "startedAt", "endedAt", "durationMs", "checks", "attachments", "secretsUsed"],
        new Dictionary<string, JsonShape>
        {
            ["error"] = JsonShape.Ordered(["type", "message", "site"]),
            ["checks"] = JsonShape.ArrayOf(Check),
            ["attachments"] = JsonShape.ArrayOf(JsonShape.Ordered(["filename", "contentType", "encoding", "content", "sizeBytes", "sha256"])),
        });

    private static readonly JsonShape Run = JsonShape.Ordered(
        ["id", "environment", "tool", "source", "actor", "target", "policy", "selection", "startedAt", "endedAt", "mergedRuns"],
        new Dictionary<string, JsonShape>
        {
            ["tool"] = JsonShape.Ordered(["name", "version", "language", "runtime"]),
            ["source"] = JsonShape.Ordered(["commit", "branch", "dirty"]),
            ["actor"] = JsonShape.Ordered(["name", "ci", "ciRunUrl"]),
            ["policy"] = JsonShape.Ordered(
                ["productionWriteBlocked", "overrides"],
                new Dictionary<string, JsonShape> { ["overrides"] = JsonShape.ArrayOf(JsonShape.Ordered(["id", "reason"])) }),
            ["selection"] = JsonShape.Ordered(["levels", "ids", "tags", "excludeTags"]),
        });

    /// <summary>The shape of a started marker, a record and a run file.</summary>
    public static JsonShape File { get; } = JsonShape.Ordered(
        ["schemaVersion", "kind", "run", "summary", "tests", "test"],
        new Dictionary<string, JsonShape>
        {
            ["run"] = Run,
            ["summary"] = JsonShape.Ordered(["total", "pass", "fail", "error", "skip", "verdict"]),
            ["tests"] = JsonShape.ArrayOf(Test),
            ["test"] = Test,
        });
}
