namespace Lekman.Qualify.Conformance;

public class CrashTests
{
    [OQ("OQ-CONF-019", "crash test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void ProcessEndsMidTest()
    {
        // Ends the test process at once, after the started marker is written.
        // The harness runs this in a child process, so it survives.
        Environment.FailFast("conformance scenario crash: the test process ends mid-test");
    }
}
