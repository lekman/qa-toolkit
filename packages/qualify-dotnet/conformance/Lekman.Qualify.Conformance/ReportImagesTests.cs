namespace Lekman.Qualify.Conformance;

public class ReportImagesTests
{
    [OQ("OQ-CONF-024", "report-images test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void PngAndJpegAttachments()
    {
        var ctx = QualifyContext.Current;
        ctx.Attach("screen.png", Image("screen.png"), "image/png");
        ctx.Attach("tall.jpg", Image("tall.jpg"), "image/jpeg");
        ctx.Attach("broken.png", "not an image"u8.ToArray(), "image/png");
        ctx.Attach("icon.png", Image("icon.png"), "image/png");
        ctx.Attach("note.txt", "hello\n", "text/plain");
        ctx.Check("fixture", "one equals one").That(1).IsEqualTo(1);
    }

    /// <summary>A file of spec/qualify/conformance/fixtures/images, found above the build output.</summary>
    private static byte[] Image(string name)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var path = Path.Combine(dir.FullName, "spec", "qualify", "conformance", "fixtures", "images", name);
            if (File.Exists(path))
            {
                return File.ReadAllBytes(path);
            }
        }

        throw new FileNotFoundException("no spec/qualify/conformance/fixtures/images above " + AppContext.BaseDirectory, name);
    }
}
