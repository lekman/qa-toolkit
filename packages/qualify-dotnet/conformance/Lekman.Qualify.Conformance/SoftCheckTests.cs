namespace Lekman.Qualify.Conformance;

public class SoftCheckTests
{
    [OQ("OQ-CONF-003", "soft-check test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void SoftFailureLetsTheTestContinue()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("fixture", "soft fails").Soft().That("a").IsEqualTo("b");
        ctx.Check("fixture", "still runs").That(true).IsTrue();
    }
}
