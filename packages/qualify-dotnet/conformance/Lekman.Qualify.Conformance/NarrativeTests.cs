namespace Lekman.Qualify.Conformance;

public class NarrativeTests
{
    [PQ("PQ-CONF-014", "narrative test", Given = "données d’entrée — 入力", When = "the run 🚀 starts", Then = "“quoted” output",
        And = ["first", "second", "third — 3"], Scope = Scope.Read)]
    public void TextSurvivesByteForByte()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("fixture", "one equals one").That(1).IsEqualTo(1);
    }
}
