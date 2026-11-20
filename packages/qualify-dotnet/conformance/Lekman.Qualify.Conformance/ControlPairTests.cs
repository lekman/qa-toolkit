namespace Lekman.Qualify.Conformance;

public class ControlPairTests
{
    [OQ("OQ-CONF-022", "an unsigned call is refused", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void UnsignedCallIsRefused()
    {
    }

    [OQ("OQ-CONF-023", "a signed call is accepted", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read,
        Controls = "OQ-CONF-022")]
    public void SignedCallIsAccepted()
    {
    }
}
