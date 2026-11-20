namespace Lekman.Qualify.Conformance;

public class DeselectedTests
{
    [OQ("OQ-CONF-020", "deselected test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void Selected()
    {
    }

    [OQ("OQ-CONF-021", "deselected test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void LeftOutByTheFilter()
    {
    }
}
