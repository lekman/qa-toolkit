using Xunit;

namespace Lekman.Qualify.Tests;

/// <summary>
/// qualify's own qualification tests: real [IQ], [OQ], [PQ] and [IU] tests
/// that run through qualify's test case and test runner in this test process.
/// Evidence goes to a temporary folder.
/// </summary>
[Collection(Collection)]
public class SelfQualification
{
    /// <summary>Tests that change the process-wide runtime run one at a time, in this collection.</summary>
    public const string Collection = "QualifyRuntime";

    internal static QualifyOptions Options { get; } = new()
    {
        EvidenceDir = Path.Combine(Path.GetTempPath(), "qualify-self-" + Environment.ProcessId),
    };

    // A static constructor, not a module initializer: the collector skips
    // assemblies loaded before it starts, and a module initializer would load
    // Lekman.Qualify as the test process starts.
    static SelfQualification() => Qualification.Configure(Options);

    [IQ("IQ-SELF-001", "The library loads its schemas", Given = "the installed package", When = "a schema is read", Then = "it parses",
        Tags = ["self"])]
    public void SchemasLoad()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("schema", "the evidence schema has no problems with an empty run").That(Schema.EvidenceSchema.Problems(new System.Text.Json.Nodes.JsonObject()).Count).IsAtLeast(1);
    }

    [OQ("OQ-SELF-002", "Checks are recorded", Given = "a test body", When = "it checks values", Then = "each check is recorded", Scope = Scope.Read,
        Requirements = ["SELF-1"], Risk = Risk.Low, Controls = "OQ-SELF-003")]
    public async Task ChecksAreRecorded()
    {
        var ctx = QualifyContext.Current;
        await Task.Yield();
        ctx.Check("context", "survives an await").That(ctx.Id).IsEqualTo("OQ-SELF-002");
        ctx.Delegate("helper", "runs", () => Assert.True(true));
    }

    [OQ("OQ-SELF-003", "A runtime skip is a skip", Given = "a test body", When = "it skips", Then = "xUnit reports a skip", Scope = Scope.Read)]
    public void SkipsAtRuntime() => QualifyContext.Current.Skip("shown as skipped by xUnit");

    [PQ("PQ-SELF-004", "Evidence is written quickly", Given = "a small body", When = "it ends", Then = "the record is written", Scope = Scope.Read)]
    public void WritesEvidence() => QualifyContext.Current.Check("records", "the evidence folder exists").That(Directory.Exists(Options.EvidenceDir)).IsTrue();

    [IU("IU-SELF-005", "A clerk reads the record", Given = "a record", When = "a clerk reads it", Then = "it reads without code", Tags = ["self"])]
    public void ReadsTheRecord() => QualifyContext.Current.Attach("note.txt", "for the reader", "text/plain");
}
