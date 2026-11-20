using System.Collections.Concurrent;
using System.Globalization;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Theme;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace Lekman.Qualify.Report;

/// <summary>
/// Renders a report document with a theme to PDF bytes with PDFsharp 6, in
/// memory. Fonts are embedded as subsets, with Unicode encoding so text
/// extraction gives back the text that was drawn.
/// </summary>
public static class PdfReportRenderer
{
    /// <summary>Lay out and draw the document: the cover without header or footer, then the content pages with both.</summary>
    public static byte[] Render(ReportDocument document, ReportTheme theme)
    {
        ArgumentNullException.ThrowIfNull(document);
        ArgumentNullException.ThrowIfNull(theme);
        var fonts = Enum.GetValues<FontSlot>().ToDictionary(slot => slot, slot => ThemeFontResolver.Register(theme.Fonts[slot]));
        var metrics = new PdfMetrics(fonts, theme);
        var g = ReportLayout.GeometryOf(theme.Spec);

        using var pdf = new PdfDocument();
        var logo = theme.Logo is null ? null : XImage.FromStream(new MemoryStream(theme.Logo));
        (double Width, double Height)? logoSize = null;
        if (logo is not null)
        {
            var height = theme.Spec.LogoHeightMm * 72 / 25.4;
            logoSize = (height * logo.PixelWidth / logo.PixelHeight, height);
        }

        var cover = ReportLayout.CoverPage(document.Cover, logoSize, metrics, g);
        var pages = new List<List<DrawOp>> { cover };
        pages.AddRange(ReportLayout.Paginate(document.Blocks, metrics, g));
        var total = pages.Count.ToString(CultureInfo.InvariantCulture);
        var palette = theme.Spec.Colours.ToDictionary(pair => pair.Key, pair => Colour(pair.Value));

        for (var index = 0; index < pages.Count; index++)
        {
            var ops = pages[index];
            if (index > 0)
            {
                var number = (index + 1).ToString(CultureInfo.InvariantCulture);
                ops = [.. ops, .. ReportLayout.PageChrome(
                    Template.Render(document.Header, document.Tokens, number, total),
                    document.Classification,
                    Template.Render(document.Footer, document.Tokens, number, total),
                    metrics,
                    g)];
            }

            var page = pdf.AddPage();
            page.Width = XUnit.FromPoint(g.Width);
            page.Height = XUnit.FromPoint(g.Height);
            using var graphics = XGraphics.FromPdfPage(page);
            foreach (var op in ReportLayout.DrawOrder(ops))
            {
                Draw(graphics, op, g, palette, metrics, logo);
            }
        }

        var metadata = document.Metadata;
        pdf.Info.Title = metadata.Title;
        pdf.Info.Subject = metadata.Subject;
        pdf.Info.Keywords = metadata.Keywords;
        pdf.Info.Creator = metadata.Producer;
        pdf.Info.CreationDate = metadata.CreationDate.UtcDateTime;
        pdf.Info.ModificationDate = metadata.CreationDate.UtcDateTime;
        pdf.Info.Elements.SetString("/Producer", metadata.Producer);
        using var output = new MemoryStream();
        pdf.Save(output, closeStream: false);
        logo?.Dispose();
        return output.ToArray();
    }

    private static void Draw(XGraphics graphics, DrawOp op, Geometry g, Dictionary<ColourName, XColor> palette, PdfMetrics metrics, XImage? logo)
    {
        switch (op)
        {
            case TextOp text:
                graphics.DrawString(text.Text, metrics.Font(text.Font, text.Size), new XSolidBrush(palette[text.Colour]), text.X, g.Height - text.Y, XStringFormats.BaseLineLeft);
                break;
            case LineOp line:
                graphics.DrawLine(new XPen(palette[line.Colour], line.Thickness), line.X1, g.Height - line.Y1, line.X2, g.Height - line.Y2);
                break;
            case FillOp fill:
                graphics.DrawRectangle(new XSolidBrush(palette[fill.Colour]), fill.X, g.Height - fill.Y - fill.Height, fill.Width, fill.Height);
                break;
            case ImageOp image when logo is not null:
                graphics.DrawImage(logo, image.X, g.Height - image.Y - image.Height, image.Width, image.Height);
                break;
        }
    }

    private static XColor Colour(string hex) => XColor.FromArgb(
        int.Parse(hex.AsSpan(1, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture),
        int.Parse(hex.AsSpan(3, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture),
        int.Parse(hex.AsSpan(5, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture));

    /// <summary>Measures text with PDFsharp, and knows which code points each font maps.</summary>
    private sealed class PdfMetrics : ITextMetrics
    {
        private static readonly XPdfFontOptions Options = new(PdfFontEncoding.Unicode, PdfFontEmbedding.TryComputeSubset);
        private readonly Dictionary<FontSlot, string> families;
        private readonly Dictionary<FontSlot, HashSet<int>> coverage;
        private readonly Dictionary<(FontSlot, double), XFont> cache = [];
        private readonly XGraphics measure = XGraphics.CreateMeasureContext(new XSize(2000, 2000), XGraphicsUnit.Point, XPageDirection.Downwards);

        public PdfMetrics(Dictionary<FontSlot, string> families, ReportTheme theme)
        {
            this.families = families;
            var shared = new Dictionary<byte[], HashSet<int>>(ReferenceEqualityComparer.Instance);
            coverage = families.Keys.ToDictionary(slot => slot, slot =>
            {
                var bytes = theme.Fonts[slot];
                if (!shared.TryGetValue(bytes, out var set))
                {
                    set = FontCoverage.Read(bytes);
                    shared[bytes] = set;
                }

                return set;
            });
        }

        public bool CanDraw(int codePoint, FontSlot font) => coverage[font].Contains(codePoint);

        public double Width(string text, double size, FontSlot font) =>
            text.Length == 0 ? 0 : measure.MeasureString(text, Font(font, size)).Width;

        public XFont Font(FontSlot slot, double size)
        {
            if (!cache.TryGetValue((slot, size), out var font))
            {
                font = new XFont(families[slot], size, XFontStyleEx.Regular, Options);
                cache[(slot, size)] = font;
            }

            return font;
        }
    }
}

/// <summary>
/// Gives PDFsharp the theme's font files. PDFsharp holds one font resolver
/// per process, so this one registers each font file under a family name
/// made from its digest and serves any theme.
/// </summary>
internal sealed class ThemeFontResolver : IFontResolver
{
    private static readonly ConcurrentDictionary<string, byte[]> Faces = new(StringComparer.Ordinal);
    private static readonly Lock Gate = new();
    private static bool installed;

    /// <summary>Register font bytes and return the family name to ask PDFsharp for.</summary>
    public static string Register(byte[] font)
    {
        lock (Gate)
        {
            if (!installed)
            {
                GlobalFontSettings.FontResolver = new ThemeFontResolver();
                installed = true;
            }
        }

        var name = "qualify-" + EvidenceFiles.Sha256(font)[..16];
        Faces.TryAdd(name, font);
        return name;
    }

    public FontResolverInfo? ResolveTypeface(string familyName, bool isBold, bool isItalic) =>
        Faces.ContainsKey(familyName) ? new FontResolverInfo(familyName) : null;

    public byte[]? GetFont(string faceName) => Faces.TryGetValue(faceName, out var bytes) ? bytes : null;
}
