using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Lekman.Qualify.Report;
using Lekman.Qualify.Theme;
using Lekman.Qualify.Trace;
using UglyToad.PdfPig;
using Xunit;

namespace Lekman.Qualify.Tests;

public class ReportImagesTests
{
    /// <summary>A4 with 20 mm margins: the text box is 481.9 by 728.5 points.</summary>
    private static readonly Geometry A4 = new(595.28, 841.89, 20 * 72 / 25.4);

    private static readonly JsonObject[] Attachments =
    [
        Attachment("screen.png", "image/png", Fixture("screen.png")),
        Attachment("tall.jpg", "image/jpeg", Fixture("tall.jpg")),
        Attachment("broken.png", "image/png", "not an image"u8.ToArray()),
        Attachment("icon.png", "image/png", Fixture("icon.png")),
        Attachment("note.txt", "text/plain", "hello\n"u8.ToArray()),
    ];

    [Fact]
    public void OnlyPngAndJpegAreDrawn()
    {
        Assert.Equal(ImageFormat.Png, ReportImages.Format("image/png"));
        Assert.Equal(ImageFormat.Jpeg, ReportImages.Format("image/jpeg"));
        foreach (var other in new[] { "image/jpg", "IMAGE/PNG", "image/gif", "text/plain" })
        {
            Assert.Null(ReportImages.Format(other));
        }
    }

    [Fact]
    public void TheSignatureOfTheFormatIsChecked()
    {
        Assert.True(ReportImages.HasSignature(Fixture("screen.png"), ImageFormat.Png));
        Assert.True(ReportImages.HasSignature(Fixture("tall.jpg"), ImageFormat.Jpeg));
        Assert.False(ReportImages.HasSignature(Fixture("tall.jpg"), ImageFormat.Png));
        Assert.False(ReportImages.HasSignature(Fixture("screen.png"), ImageFormat.Jpeg));
        Assert.False(ReportImages.HasSignature([0xFF, 0xD8], ImageFormat.Jpeg));
    }

    [Fact]
    public void ImagesScaleDownToTheBoxAndNeverUp()
    {
        var box = (481.9, 364.25);
        var wide = ReportImages.Fit((1280, 720), box);
        Assert.Equal(481.9, wide.Width, 1);
        Assert.Equal(271.1, wide.Height, 1);
        var tall = ReportImages.Fit((200, 600), box);
        Assert.Equal(121.4, tall.Width, 1);
        Assert.Equal(364.25, tall.Height, 1);
        Assert.Equal((48d, 48d), ReportImages.Fit((48, 48), box));
    }

    [Fact]
    public void CaptionAndUnreadableLine()
    {
        var screen = Attachments[0];
        Assert.Equal($"screen.png, {screen["sizeBytes"]} bytes, SHA-256 {((string)screen["sha256"]!)[..12]}", ReportImages.Caption(screen));
        Assert.Equal("broken.png could not be read as image/png, so it is not drawn.", ReportImages.Unreadable(Attachments[2]));
    }

    [Fact]
    public void ImageBlocksFollowTheAttachmentsTableInTheOrderAttached()
    {
        var document = ReportContent.Build(Input());
        var blocks = document.Blocks.ToList();
        var at = blocks.FindIndex(b => b is HeadingBlock { Text: "Attachments" });
        Assert.IsType<TableBlock>(blocks[at + 1]);
        var images = blocks.Skip(at + 2).OfType<ImageBlock>().ToList();
        Assert.Equal(["screen.png", "tall.jpg", "broken.png", "icon.png"], images.Select(b => b.Caption.Split(',')[0]));
        Assert.Equal([0, 1, 2, 3], images.Select(b => b.Image));
        Assert.Equal([ImageFormat.Png, ImageFormat.Jpeg, ImageFormat.Png, ImageFormat.Png], document.Images.Select(i => i.Format));
        Assert.Equal(Fixture("tall.jpg"), document.Images[1].Bytes);
    }

    [Fact]
    public void AnImageIsFittedFramedAndCaptioned()
    {
        var page = ReportLayout.Paginate([new ImageBlock(0, "image 0", "image 0 unreadable")], new Metrics(), A4, [(1280, 720)]).Single();
        var image = page.OfType<ImageOp>().Single();
        Assert.Equal(0, image.Image);
        Assert.Equal(56.69, image.X, 2);
        Assert.Equal(481.9, image.Width, 1);
        Assert.Equal(271.1, image.Height, 1);
        var frame = page.OfType<LineOp>().ToList();
        Assert.Equal(4, frame.Count);
        Assert.All(frame, line => Assert.True(line.Colour == ColourName.Rule && line.Thickness == 0.5));
        var caption = page.OfType<TextOp>().Single();
        Assert.Equal(("image 0", ColourName.Muted, 8.5, FontSlot.Body), (caption.Text, caption.Colour, caption.Size, caption.Font));
        Assert.True(caption.Y < image.Y);
    }

    [Fact]
    public void AnUnreadableImageBecomesItsLine()
    {
        var page = ReportLayout.Paginate([new ImageBlock(0, "image 0", "image 0 unreadable")], new Metrics(), A4, [null]).Single();
        Assert.Empty(page.OfType<ImageOp>());
        var line = page.OfType<TextOp>().Single();
        Assert.Equal(("image 0 unreadable", ColourName.Text, 9d), (line.Text, line.Colour, line.Size));
        Assert.Empty(ReportLayout.Paginate([new ImageBlock(3, "c", "u")], new Metrics(), A4).Single().OfType<ImageOp>());
    }

    [Fact]
    public void AnImageAndItsCaptionMoveToTheNextPageTogether()
    {
        var pages = ReportLayout.Paginate(
            [new ImageBlock(0, "image 0", "u"), new ImageBlock(1, "image 1", "u"), new ImageBlock(2, "image 2", "u")],
            new Metrics(),
            A4,
            [(200, 300), (200, 300), (200, 300)]);
        Assert.Equal(2, pages.Count);
        Assert.Equal([2], pages[1].OfType<ImageOp>().Select(i => i.Image));
        Assert.Equal(["image 2"], pages[1].OfType<TextOp>().Select(t => t.Text));
    }

    [Fact]
    public void ThePdfDrawsThePngAndJpegAttachmentsAndListsTheUnreadableOne()
    {
        var theme = ThemeLoader.Load("plain", "/", new BundledOnly());
        var bytes = PdfReportRenderer.Render(ReportContent.Build(Input()), theme);
        var lines = Lines(bytes);
        foreach (var expected in new[] { ReportImages.Caption(Attachments[0]), ReportImages.Caption(Attachments[1]), "broken.png could not be read as image/png, so it is not drawn.", ReportImages.Caption(Attachments[3]) })
        {
            Assert.Contains(lines, line => line.Contains(expected, StringComparison.Ordinal));
        }

        Assert.DoesNotContain(lines, line => line.StartsWith("note.txt,", StringComparison.Ordinal));
        using var pdf = PdfDocument.Open(bytes);
        var placed = pdf.GetPages().Skip(1).SelectMany(p => p.GetImages()).Select(i => $"{i.WidthInSamples}x{i.HeightInSamples}").ToList();
        Assert.Equal(["960x540", "200x600", "48x48"], placed);
    }

    [Fact]
    public void BytesWithTheSignatureThatDoNotDecodeAreNotDrawn()
    {
        Assert.Null(PdfReportRenderer.Decode(new ImageSource(Fixture("screen.png")[..40], ImageFormat.Png)));
        Assert.Null(PdfReportRenderer.Decode(new ImageSource([0xFF, 0xD8, 0xFF, 0x00], ImageFormat.Jpeg)));
        Assert.Null(PdfReportRenderer.Decode(new ImageSource("not an image"u8.ToArray(), ImageFormat.Png)));
        using var icon = PdfReportRenderer.Decode(new ImageSource(Fixture("icon.png"), ImageFormat.Png));
        Assert.Equal(48, icon!.PixelWidth);
    }

    private static List<string> Lines(byte[] bytes)
    {
        using var pdf = PdfDocument.Open(bytes);
        return [.. pdf.GetPages().SelectMany(page => page.GetWords()
            .GroupBy(word => Math.Round(word.Letters[0].StartBaseLine.Y, 1))
            .Select(group => string.Join(' ', group.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text))))];
    }

    private static ReportInput Input()
    {
        var run = TraceTests.Run(Records.Test("OQ-ALPHA-001").Also(t => t["attachments"] = new JsonArray([.. Attachments.Select(a => a.DeepClone())])));
        return new ReportInput
        {
            Run = run,
            Digest = new string('d', 64),
            Trace = TraceMatrix.Build(run, null, null),
            Theme = ThemeLoader.Load("plain", "/", new BundledOnly()).Spec,
            Producer = "Lekman.Qualify 0.1.0",
            Options = new ReportOptions { GeneratedAt = DateTimeOffset.UnixEpoch },
        };
    }

    private static byte[] Fixture(string name) => File.ReadAllBytes(Repo.Spec("conformance", "fixtures", "images", name));

    private static JsonObject Attachment(string filename, string contentType, byte[] bytes) => new()
    {
        ["filename"] = filename,
        ["contentType"] = contentType,
        ["encoding"] = "base64",
        ["content"] = Convert.ToBase64String(bytes),
        ["sizeBytes"] = bytes.Length,
        ["sha256"] = Convert.ToHexStringLower(SHA256.HashData(bytes)),
    };

    /// <summary>Every character is half the font size wide.</summary>
    private sealed class Metrics : ITextMetrics
    {
        public bool CanDraw(int codePoint, FontSlot font) => true;

        public double Width(string text, double size, FontSlot font) => Encoding.UTF8.GetByteCount(text) * size * 0.5;
    }

    private sealed class BundledOnly : IThemeFiles
    {
        public byte[] ReadBytes(string path) => throw new FileNotFoundException(path);
    }
}
