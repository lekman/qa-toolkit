namespace Lekman.Qualify.Conformance;

public class FailingCheckStopsTests
{
    [OQ("OQ-CONF-002", "failing-check-stops test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void SecondCheckStopsTheTest()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("fixture", "first passes").That(1).IsEqualTo(1);
        ctx.Check("fixture", "second fails").That(2).IsEqualTo(3);
        ctx.Check("fixture", "third never runs").That(4).IsEqualTo(4);
    }
}
