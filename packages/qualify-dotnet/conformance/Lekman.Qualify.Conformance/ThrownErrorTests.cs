namespace Lekman.Qualify.Conformance;

public class ThrownErrorTests
{
    [OQ("OQ-CONF-004", "thrown-error test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void BodyThrows()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("fixture", "one equals one").That(1).IsEqualTo(1);
        throw new InvalidOperationException("boom");
    }
}
