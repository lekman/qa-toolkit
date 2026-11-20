namespace Lekman.Qualify.Conformance;

public class AttachmentsTests
{
    [OQ("OQ-CONF-015", "attachments test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void TextAndBytes()
    {
        var ctx = QualifyContext.Current;
        ctx.Attach("note.txt", "hello\n", "text/plain");
        ctx.Attach("blob.bin", Enumerable.Range(0, 256).Select(i => (byte)i).ToArray(), "application/octet-stream");
        ctx.Check("fixture", "one equals one").That(1).IsEqualTo(1);
    }

    [OQ("OQ-CONF-016", "attachments test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void OverTheLimit()
    {
        var ctx = QualifyContext.Current;
        ctx.Attach("big.txt", new string('a', 17), "text/plain");
    }
}
