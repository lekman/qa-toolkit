namespace Lekman.Qualify.Conformance;

public class AllPassTests
{
    [IQ("IQ-CONF-001", "all-pass test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then)]
    public void TwoChecksPass()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("fixture", "one equals one").That(1).IsEqualTo(1);
        ctx.Check("fixture", "text contains a word").That("qualify").Contains("ali");
    }
}
