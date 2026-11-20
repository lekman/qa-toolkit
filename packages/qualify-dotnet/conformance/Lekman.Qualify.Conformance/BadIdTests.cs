namespace Lekman.Qualify.Conformance;

public class BadIdTests
{
    [OQ("OQ-conf-009", "bad-id test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void LowerCaseId()
    {
    }

    [OQ("IQ-CONF-010", "bad-id test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void PrefixDoesNotMatchLevel()
    {
    }
}
