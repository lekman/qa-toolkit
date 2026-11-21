namespace Lekman.Qualify.Conformance;

public class PolicySkipTests
{
    [OQ("OQ-CONF-007", "policy-skip test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.ReadWrite)]
    public void WritesToTheSystem()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("fixture", "one equals one").That(1).IsEqualTo(1);
    }
}
