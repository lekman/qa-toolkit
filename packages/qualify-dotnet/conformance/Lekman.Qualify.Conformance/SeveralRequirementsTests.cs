namespace Lekman.Qualify.Conformance;

public class SeveralRequirementsTests
{
    [OQ("OQ-CONF-013", "several-requirements test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read,
        Requirements = ["REQ-1", "REQ-2"])]
    public void CoversTwoRequirements()
    {
    }
}
