namespace Lekman.Qualify.Conformance;

public class RuntimeSkipTests
{
    [OQ("OQ-CONF-006", "runtime-skip test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void SkipsAtRuntime()
    {
        var ctx = QualifyContext.Current;
        ctx.Check("fixture", "one equals one").That(1).IsEqualTo(1);
        ctx.Skip("fixture not seeded");
    }
}
