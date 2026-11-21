namespace Lekman.Qualify.Conformance;

public class DuplicateIdATests
{
    [OQ("OQ-CONF-018", "duplicate-id test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void FirstDeclaration()
    {
    }
}
