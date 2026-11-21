namespace Lekman.Qualify.Conformance;

public class MissingScopeTests
{
    [OQ("OQ-CONF-008", "missing-scope test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then)]
    public void DeclaredWithoutScope()
    {
    }
}
