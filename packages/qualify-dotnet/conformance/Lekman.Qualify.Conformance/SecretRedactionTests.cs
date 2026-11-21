using System.Text;

namespace Lekman.Qualify.Conformance;

public class SecretRedactionTests
{
    [OQ("OQ-CONF-011", "secret-redaction test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void SecretNeverReachesTheEvidence()
    {
        var ctx = QualifyContext.Current;
        var t = ctx.Secret("CONFORMANCE_TOKEN");
        ctx.Check("api", "token " + t + " is used").That("Bearer " + t).Contains(t);
        ctx.Attach(
            "request.json",
            new Dictionary<string, object?> { ["url"] = "/x", ["token"] = t, ["note"] = "x " + t },
            "application/json");
        ctx.Attach("raw.bin", [0x00, 0xFF, .. Encoding.UTF8.GetBytes(t), 0x00], "application/octet-stream");
        throw new InvalidOperationException("failed with " + t);
    }
}
