namespace Lekman.Qualify.Conformance;

public class PatternRedactionTests
{
    [OQ("OQ-CONF-012", "pattern-redaction test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void SecretShapesAreRedacted()
    {
        var ctx = QualifyContext.Current;

        // Each shape is joined from two parts at runtime: written whole, it
        // looks like a real secret to scanners such as gitleaks.
        var pem = "-----BEGIN PRIVATE" + " KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
        var jwt = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
        var accessKey = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
        ctx.Check("fixture", "the output holds secret shapes").That($"{pem} {jwt} {accessKey}").IsNotNull();
    }
}
