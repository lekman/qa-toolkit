using Xunit;

namespace Lekman.Qualify.Conformance;

public class PlainAssertionTests
{
    [OQ("OQ-CONF-005", "plain-assertion test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void HelperAssertionFails()
    {
        var ctx = QualifyContext.Current;
        ctx.Delegate("helper", "shared helper passes", () => Assert.Fail("helper failed"));
    }
}
