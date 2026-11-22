using Lekman.Qualify.Theme;

namespace Lekman.Qualify.Report;

/// <summary>Measures text in a theme's fonts.</summary>
public interface ITextMetrics
{
    /// <summary>Whether a font slot can draw a code point.</summary>
    bool CanDraw(int codePoint, FontSlot font);

    /// <summary>The width of text at a size, in points.</summary>
    double Width(string text, double size, FontSlot font);
}

/// <summary>Page size and margin in points.</summary>
public sealed record Geometry(double Width, double Height, double Margin);

/// <summary>A drawing instruction on one page, in points from the bottom left.</summary>
public abstract record DrawOp;

/// <summary>Text with its baseline at <c>y</c>.</summary>
public sealed record TextOp(string Text, double X, double Y, double Size, FontSlot Font, ColourName Colour) : DrawOp;

/// <summary>A straight line.</summary>
public sealed record LineOp(double X1, double Y1, double X2, double Y2, double Thickness, ColourName Colour) : DrawOp;

/// <summary>A filled rectangle with its lower left corner at <c>x</c>, <c>y</c>.</summary>
public sealed record FillOp(double X, double Y, double Width, double Height, ColourName Colour) : DrawOp;

/// <summary>An image with its lower left corner at <c>x</c>, <c>y</c>.</summary>
/// <param name="X">The left edge.</param>
/// <param name="Y">The bottom edge.</param>
/// <param name="Width">The drawn width in points.</param>
/// <param name="Height">The drawn height in points.</param>
/// <param name="Image">The index into the document's images; null for the theme's logo.</param>
public sealed record ImageOp(double X, double Y, double Width, double Height, int? Image = null) : DrawOp;

/// <summary>
/// Layout of the report on pages, section 9.2 of the specification: the
/// cover, the content pages after it, and the header and footer. Pure: text
/// is measured through <see cref="ITextMetrics"/>.
/// </summary>
public static class ReportLayout
{
    /// <summary>Body text size.</summary>
    public const double Body = 9;

    /// <summary>Mono runs wide; at 8.5 pt a SHA-256 digest fits the value column on A4.</summary>
    public const double Mono = 8.5;

    /// <summary>Header and footer size.</summary>
    public const double Chrome = 8.5;

    /// <summary>Level 1 heading size.</summary>
    public const double H1 = 20;

    /// <summary>Level 2 heading size.</summary>
    public const double H2 = 14;

    /// <summary>Level 3 heading size.</summary>
    public const double H3 = 11;

    /// <summary>Image caption size.</summary>
    public const double Caption = 8.5;

    private const double PadY = 3.5;
    private const double PadX = 4;
    private const double Label = 0.28;
    private const double Mm = 72 / 25.4;

    /// <summary>The page size and margin a theme asks for, in points.</summary>
    public static Geometry GeometryOf(ThemeSpec theme)
    {
        ArgumentNullException.ThrowIfNull(theme);
        return theme.PageSize == "Letter"
            ? new Geometry(612, 792, theme.MarginMm * Mm)
            : new Geometry(595.28, 841.89, theme.MarginMm * Mm);
    }

    /// <summary>
    /// The header and footer of one content page: the header text on the left
    /// and the classification on the right above a hairline, and the footer
    /// text right-aligned below a hairline.
    /// </summary>
    public static List<DrawOp> PageChrome(string header, string classification, string footer, ITextMetrics metrics, Geometry g)
    {
        ArgumentNullException.ThrowIfNull(metrics);
        ArgumentNullException.ThrowIfNull(g);
        var left = g.Margin;
        var right = g.Width - g.Margin;
        var headerY = g.Height - (g.Margin / 2) - (Chrome / 2);
        var footerY = (g.Margin / 2) - Chrome;
        var width = right - left;
        var ops = new List<DrawOp>();
        var c = Fit(Clean(metrics, classification, FontSlot.Body), width / 2, Chrome, FontSlot.Body, metrics);
        var room = c.Length == 0 ? width : width - metrics.Width(c, Chrome, FontSlot.Body) - 12;
        var h = Fit(Clean(metrics, header, FontSlot.Body), room, Chrome, FontSlot.Body, metrics);
        var f = Fit(Clean(metrics, footer, FontSlot.Body), width, Chrome, FontSlot.Body, metrics);
        if (h.Length > 0)
        {
            ops.Add(new TextOp(h, left, headerY, Chrome, FontSlot.Body, ColourName.Muted));
        }

        if (c.Length > 0)
        {
            ops.Add(new TextOp(c, right - metrics.Width(c, Chrome, FontSlot.Body), headerY, Chrome, FontSlot.Body, ColourName.Muted));
        }

        ops.Add(new LineOp(left, headerY - 5, right, headerY - 5, 0.5, ColourName.Rule));
        ops.Add(new LineOp(left, footerY + Chrome + 5, right, footerY + Chrome + 5, 0.5, ColourName.Rule));
        if (f.Length > 0)
        {
            ops.Add(new TextOp(f, right - metrics.Width(f, Chrome, FontSlot.Body), footerY, Chrome, FontSlot.Body, ColourName.Muted));
        }

        return ops;
    }

    /// <summary>
    /// The cover, section 9.1: logo and brand name at the top left, the title
    /// at 40% of the page height with an accent rule and the subtitle below
    /// it, and the metadata rows above the bottom margin under a hairline. A
    /// long title moves up, and then shrinks, so it never runs into the rows.
    /// </summary>
    /// <param name="cover">What the cover shows.</param>
    /// <param name="logo">The logo's drawn width and height, or null.</param>
    /// <param name="metrics">Measures text.</param>
    /// <param name="g">The page geometry.</param>
    public static List<DrawOp> CoverPage(Cover cover, (double Width, double Height)? logo, ITextMetrics metrics, Geometry g)
    {
        ArgumentNullException.ThrowIfNull(cover);
        ArgumentNullException.ThrowIfNull(metrics);
        ArgumentNullException.ThrowIfNull(g);
        var ops = new List<DrawOp>();
        var width = g.Width - (2 * g.Margin);
        var top = g.Height - g.Margin;

        // Brand: the logo, and the name beside it, vertically centred.
        var brandBottom = top;
        const double brandSize = 14;
        if (logo is { } image)
        {
            ops.Add(new ImageOp(g.Margin, top - image.Height, image.Width, image.Height));
            brandBottom = top - image.Height;
        }

        if (!string.IsNullOrEmpty(cover.BrandName))
        {
            var name = Clean(metrics, cover.BrandName, FontSlot.Heading);
            var x = g.Margin + (logo is null ? 0 : logo.Value.Width + 10);
            var y = logo is null ? top - (brandSize * 0.8) : top - (logo.Value.Height / 2) - (brandSize * 0.35);
            ops.Add(new TextOp(name, x, y, brandSize, FontSlot.Heading, ColourName.Muted));
            brandBottom = Math.Min(brandBottom, y - (brandSize * 0.3));
        }

        // Metadata rows at the bottom margin, under a hairline.
        const double rowSize = 9;
        const double rowHeight = rowSize * 1.75;
        var labelWidth = cover.Fields
            .Select(f => metrics.Width(Clean(metrics, f.Label, FontSlot.BodyBold), rowSize, FontSlot.BodyBold) + 12)
            .Append(28 * Mm)
            .Max();
        var blockTop = g.Margin + ((cover.Fields.Count - 1) * rowHeight) + rowSize + 10;
        ops.Add(new LineOp(g.Margin, blockTop, g.Margin + width, blockTop, 0.5, ColourName.Rule));
        for (var i = 0; i < cover.Fields.Count; i++)
        {
            var field = cover.Fields[i];
            var y = g.Margin + ((cover.Fields.Count - 1 - i) * rowHeight);
            ops.Add(new TextOp(Clean(metrics, field.Label, FontSlot.BodyBold), g.Margin, y, rowSize, FontSlot.BodyBold, ColourName.Text));
            var value = Clean(metrics, field.Value, FontSlot.Body);
            var lines = Wrap(value, width - labelWidth, rowSize, FontSlot.Body, metrics);
            ops.Add(new TextOp(lines.Count > 1 ? lines[0] + "…" : value, g.Margin + labelWidth, y, rowSize, FontSlot.Body, ColourName.Muted));
        }

        // Title, accent rule and subtitle, placed as a block.
        const double subtitleSize = 13;
        var subtitleLines = Wrap(Clean(metrics, cover.Subtitle, FontSlot.Body), width, subtitleSize, FontSlot.Body, metrics);
        var subtitle = subtitleLines.Where((line, i) => line.Length > 0 || subtitleLines.Count == 1).ToList();
        var floor = blockTop + (12 * Mm);
        var ceiling = brandBottom - (10 * Mm);
        var start = g.Height * 0.6;

        CoverTitle Place(double size, double firstTop)
        {
            var lines = Wrap(Clean(metrics, cover.Title, FontSlot.Heading), width, size, FontSlot.Heading, metrics);
            var lh = size * 1.15;
            var baselines = lines.Select((_, i) => firstTop - (size * 0.78) - (i * lh)).ToList();
            var ruleY = baselines[^1] - (size * 0.22) - (6 * Mm);
            var subTop = ruleY - (6 * Mm);
            var subBaselines = subtitle.Select((_, i) => subTop - (subtitleSize * 0.8) - (i * LineHeight(subtitleSize))).ToList();
            var bottom = cover.Subtitle.Length > 0 && subBaselines.Count > 0 ? subBaselines[^1] - (subtitleSize * 0.25) : ruleY;
            return new CoverTitle(lines, size, baselines, ruleY, subBaselines, bottom);
        }

        var layout = Place(30, start);
        foreach (var size in new double[] { 30, 26, 22, 18 })
        {
            layout = Place(size, start);
            if (layout.Bottom < floor)
            {
                layout = Place(size, Math.Min(ceiling, start + (floor - layout.Bottom)));
            }

            if (layout.Bottom >= floor)
            {
                break;
            }
        }

        for (var i = 0; i < layout.Lines.Count; i++)
        {
            ops.Add(new TextOp(layout.Lines[i], g.Margin, layout.Baselines[i], layout.Size, FontSlot.Heading, ColourName.Title));
        }

        ops.Add(new LineOp(g.Margin, layout.RuleY, g.Margin + (30 * Mm), layout.RuleY, 1.5, ColourName.Accent));
        if (cover.Subtitle.Length > 0)
        {
            for (var i = 0; i < subtitle.Count; i++)
            {
                ops.Add(new TextOp(subtitle[i], g.Margin, layout.SubBaselines[i], subtitleSize, FontSlot.Body, ColourName.Muted));
            }
        }

        return ops;
    }

    /// <summary>
    /// The order to draw a page in: fills first, then images, lines and text,
    /// so a row's fill never covers the hairline of the row above it.
    /// </summary>
    public static List<DrawOp> DrawOrder(IEnumerable<DrawOp> page)
    {
        ArgumentNullException.ThrowIfNull(page);
        static int Rank(DrawOp op) => op switch
        {
            FillOp => 0,
            ImageOp => 1,
            LineOp => 2,
            _ => 3,
        };
        return [.. page.OrderBy(Rank)];
    }

    /// <summary>Shorten text to a width, ending it with <c>…</c> when it had to be cut.</summary>
    public static string Fit(string text, double width, double size, FontSlot font, ITextMetrics metrics)
    {
        ArgumentNullException.ThrowIfNull(text);
        ArgumentNullException.ThrowIfNull(metrics);
        if (metrics.Width(text, size, font) <= width)
        {
            return text;
        }

        var runes = text.EnumerateRunes().Select(r => r.ToString()).ToList();
        while (runes.Count > 0 && metrics.Width(string.Concat(runes).TrimEnd() + "…", size, font) > width)
        {
            runes.RemoveAt(runes.Count - 1);
        }

        return runes.Count == 0 ? string.Empty : string.Concat(runes).TrimEnd() + "…";
    }

    /// <summary>
    /// Lay out the content blocks on pages after the cover. <paramref name="images"/>
    /// holds the pixel size of each image the blocks refer to, or null for one
    /// the PDF library could not read.
    /// </summary>
    public static List<List<DrawOp>> Paginate(IReadOnlyList<Block> blocks, ITextMetrics metrics, Geometry g, IReadOnlyList<(double Width, double Height)?>? images = null)
    {
        ArgumentNullException.ThrowIfNull(blocks);
        var cursor = new Cursor(metrics, g, images ?? []);
        for (var i = 0; i < blocks.Count; i++)
        {
            Place(cursor, blocks[i], i + 1 < blocks.Count ? blocks[i + 1] : null);
        }

        return cursor.Pages;
    }

    /// <summary>
    /// Wrap text to a width: at spaces where possible, inside a word that is
    /// wider than the line on its own. Line breaks in the text are kept.
    /// </summary>
    public static List<string> Wrap(string text, double width, double size, FontSlot font, ITextMetrics metrics)
    {
        ArgumentNullException.ThrowIfNull(text);
        ArgumentNullException.ThrowIfNull(metrics);
        bool Fits(string t) => metrics.Width(t, size, font) <= width;
        var lines = new List<string>();
        foreach (var paragraph in text.Split('\n'))
        {
            var line = string.Empty;
            foreach (var word in paragraph.Split(' '))
            {
                var candidate = line.Length == 0 ? word : $"{line} {word}";
                if (Fits(candidate))
                {
                    line = candidate;
                    continue;
                }

                if (line.Length > 0)
                {
                    lines.Add(line);
                }

                line = string.Empty;
                if (Fits(word))
                {
                    line = word;
                    continue;
                }

                foreach (var rune in word.EnumerateRunes())
                {
                    var c = rune.ToString();
                    if (line.Length > 0 && !Fits(line + c))
                    {
                        lines.Add(line);
                        line = string.Empty;
                    }

                    line += c;
                }
            }

            lines.Add(line);
        }

        return lines;
    }

    private static double LineHeight(double size) => size * 1.4;

    private static double SizeOf(FontSlot font) => font == FontSlot.Mono ? Mono : Body;

    private static string Clean(ITextMetrics metrics, string text, FontSlot font) =>
        ReportText.Drawable(text, code => metrics.CanDraw(code, font));

    private static void Place(Cursor cursor, Block block, Block? next)
    {
        var metrics = cursor.Metrics;
        switch (block)
        {
            case HeadingBlock heading:
                {
                    var size = heading.Level switch { 1 => H1, 2 => H2, _ => H3 };
                    var colour = heading.Level == 1 ? ColourName.Title : ColourName.Heading;
                    var lines = Wrap(Clean(metrics, heading.Text, FontSlot.Heading), cursor.Width, size, FontSlot.Heading, metrics);
                    var before = heading.Level switch { 1 => 0, 2 => 16, _ => 9 };
                    var after = heading.Level == 1 ? 18 : 4;

                    // Keep a heading with the start of what follows: a whole
                    // field list, a table's header and first row, a list's
                    // first item, or the first three signature roles, as far
                    // as that fits on a page.
                    var follow = Math.Min(
                        LeadHeight(cursor, next),
                        cursor.Top - cursor.Bottom - before - (lines.Count * LineHeight(size)) - after);
                    var needed = before + (lines.Count * LineHeight(size)) + after + follow;
                    if (cursor.Room < needed)
                    {
                        cursor.NewPage();
                    }
                    else if (cursor.Y < cursor.Top)
                    {
                        cursor.Y -= before;
                    }

                    cursor.Lines(lines, size, FontSlot.Heading, colour);
                    if (heading.Level == 1)
                    {
                        cursor.Page.Add(new LineOp(cursor.G.Margin, cursor.Y - 2, cursor.G.Margin + cursor.Width, cursor.Y - 2, 1, ColourName.Accent));
                    }

                    cursor.Y -= after;
                    return;
                }

            case ParagraphBlock paragraph:
                cursor.Lines(Wrap(Clean(metrics, paragraph.Text, FontSlot.Body), cursor.Width, Body, FontSlot.Body, metrics), Body, FontSlot.Body, ColourName.Text);
                cursor.Y -= 4;
                return;
            case ListBlock list:
                {
                    var bullet = metrics.CanDraw(0x2022, FontSlot.Body) ? "•" : "-";
                    foreach (var item in list.Items)
                    {
                        var lines = Wrap(Clean(metrics, item, FontSlot.Body), cursor.Width - 12, Body, FontSlot.Body, metrics);
                        if (cursor.Room < LineHeight(Body))
                        {
                            cursor.NewPage();
                        }

                        cursor.Text(bullet, cursor.G.Margin + 2, cursor.Y - Body, Body, FontSlot.Body, ColourName.Text);
                        cursor.Lines(lines, Body, FontSlot.Body, ColourName.Text, cursor.G.Margin + 12);
                    }

                    cursor.Y -= 4;
                    return;
                }

            case FieldsBlock fieldList:
                Fields(cursor, fieldList.Fields);
                cursor.Y -= 4;
                return;
            case TableBlock table:
                Table(cursor, table.Columns, table.Rows);
                cursor.Y -= 6;
                return;
            case SignaturesBlock signatures:
                Signatures(cursor, signatures.Roles);
                return;
            case ImageBlock image:
                Image(cursor, image);
                return;
        }
    }

    /// <summary>
    /// An image attachment, section 9.2: scaled into the text width and half
    /// the text height, framed in the rule colour, with its caption below, and
    /// both kept on one page. An image that cannot be read becomes a line of text.
    /// </summary>
    private static void Image(Cursor cursor, ImageBlock block)
    {
        var pixels = block.Image < cursor.Images.Count ? cursor.Images[block.Image] : null;
        if (pixels is not { } known)
        {
            Place(cursor, new ParagraphBlock(block.Unreadable), null);
            return;
        }

        var (width, height) = ReportImages.Fit(known, (cursor.Width, (cursor.Top - cursor.Bottom) / 2));
        var caption = Wrap(Clean(cursor.Metrics, block.Caption, FontSlot.Body), cursor.Width, Caption, FontSlot.Body, cursor.Metrics);
        const double before = 6;
        const double gap = 4;
        var needed = before + height + gap + (caption.Count * LineHeight(Caption));
        if (cursor.Room < needed)
        {
            cursor.NewPage();
        }
        else if (cursor.Y < cursor.Top)
        {
            cursor.Y -= before;
        }

        var x = cursor.G.Margin;
        var y = cursor.Y - height;
        var right = x + width;
        var top = y + height;
        cursor.Page.Add(new ImageOp(x, y, width, height, block.Image));
        cursor.Page.Add(new LineOp(x, y, right, y, 0.5, ColourName.Rule));
        cursor.Page.Add(new LineOp(right, y, right, top, 0.5, ColourName.Rule));
        cursor.Page.Add(new LineOp(right, top, x, top, 0.5, ColourName.Rule));
        cursor.Page.Add(new LineOp(x, top, x, y, 0.5, ColourName.Rule));
        cursor.Y = y - gap;
        cursor.Lines(caption, Caption, FontSlot.Body, ColourName.Muted);
        cursor.Y -= 8;
    }

    private static (List<string> Label, List<string> Value, FontSlot Font) FieldLines(Cursor cursor, Field field)
    {
        var metrics = cursor.Metrics;
        var labelWidth = cursor.Width * Label;
        var font = field.Mono ? FontSlot.Mono : FontSlot.Body;
        var label = Wrap(Clean(metrics, field.Label, FontSlot.BodyBold), labelWidth - PadX, Body, FontSlot.BodyBold, metrics);
        var value = Wrap(Clean(metrics, field.Value, font), cursor.Width - labelWidth, SizeOf(font), font, metrics);
        return (label, value, font);
    }

    private static void Fields(Cursor cursor, IReadOnlyList<Field> fields)
    {
        var labelWidth = cursor.Width * Label;
        var lh = LineHeight(Body);
        foreach (var field in fields)
        {
            var (label, value, font) = FieldLines(cursor, field);
            var rows = Math.Max(label.Count, value.Count);
            var height = (rows * lh) + 2;
            if (height > cursor.Room && height <= cursor.Top - cursor.Bottom)
            {
                cursor.NewPage();
            }

            for (var i = 0; i < rows; i++)
            {
                if (cursor.Room < lh)
                {
                    cursor.NewPage();
                }

                var y = cursor.Y - Body;
                if (i < label.Count)
                {
                    cursor.Text(label[i], cursor.G.Margin, y, Body, FontSlot.BodyBold, ColourName.Text);
                }

                if (i < value.Count)
                {
                    cursor.Text(value[i], cursor.G.Margin + labelWidth, y, SizeOf(font), font, ColourName.Text);
                }

                cursor.Y -= lh;
            }

            cursor.Y -= 2;
        }
    }

    /// <summary>The height a field list takes when laid out whole.</summary>
    private static double FieldsHeight(Cursor cursor, IReadOnlyList<Field> fields) =>
        fields.Sum(field =>
        {
            var (label, value, _) = FieldLines(cursor, field);
            return (Math.Max(label.Count, value.Count) * LineHeight(Body)) + 2;
        });

    /// <summary>The height of what a heading must keep with: the start of the next block.</summary>
    private static double LeadHeight(Cursor cursor, Block? next)
    {
        var lh = LineHeight(Body);
        double HeightOf(List<List<string>> cells) => (Math.Max(1, cells.Max(c => c.Count)) * lh) + (2 * PadY);
        switch (next)
        {
            case FieldsBlock fields:
                return FieldsHeight(cursor, fields.Fields);
            case TableBlock table:
                {
                    var (_, _, header, wrapped) = TableCells(cursor, table.Columns, [.. table.Rows.Take(1)]);
                    return HeightOf(header) + (wrapped.Count > 0 ? HeightOf(wrapped[0]) : 0);
                }

            case ListBlock list:
                return Wrap(Clean(cursor.Metrics, list.Items.Count > 0 ? list.Items[0] : string.Empty, FontSlot.Body), cursor.Width - 12, Body, FontSlot.Body, cursor.Metrics).Count * lh;
            case SignaturesBlock signatures:
                return SignatureHeight() * Math.Min(signatures.Roles.Count, 3);
            default:
                return (2 * lh) + (2 * PadY);
        }
    }

    /// <summary>The height one signature role takes.</summary>
    private static double SignatureHeight() => LineHeight(H3) + (3 * (LineHeight(Body) + 14)) + 12;

    /// <summary>A table's column widths and fonts, and its header and rows wrapped to them.</summary>
    private static (List<double> Widths, List<FontSlot> Fonts, List<List<string>> Header, List<List<List<string>>> Wrapped) TableCells(
        Cursor cursor,
        IReadOnlyList<Column> columns,
        IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var metrics = cursor.Metrics;
        var widths = columns.Select(c => c.Width * cursor.Width).ToList();
        var fonts = columns.Select(c => c.Mono ? FontSlot.Mono : FontSlot.Body).ToList();
        List<List<string>> WrapRow(IReadOnlyList<string> cells, Func<int, FontSlot> font) =>
            [.. cells.Select((cell, column) => Wrap(Clean(metrics, cell, font(column)), widths[column] - (2 * PadX), SizeOf(font(column)), font(column), metrics))];
        var header = WrapRow([.. columns.Select(c => c.Header)], _ => FontSlot.BodyBold);
        var wrapped = rows.Select(row => WrapRow(row, column => fonts[column])).ToList();
        return (widths, fonts, header, wrapped);
    }

    /// <summary>Draw one table row, filled or not, splitting it only when it is taller than a page.</summary>
    private static void Row(
        Cursor cursor,
        List<double> widths,
        List<List<string>> cells,
        IReadOnlyList<(FontSlot Font, ColourName Colour)> styles,
        ColourName? fill,
        Action onNewPage)
    {
        var lh = LineHeight(Body);
        var total = Math.Max(1, cells.Max(c => c.Count));
        var height = (total * lh) + (2 * PadY);
        if (height > cursor.Room && height <= cursor.Top - cursor.Bottom)
        {
            cursor.NewPage();
            onNewPage();
        }

        var from = 0;
        while (from < total)
        {
            if (cursor.Room < lh + (2 * PadY))
            {
                cursor.NewPage();
                onNewPage();
            }

            var fit = Math.Max(1, (int)Math.Floor((cursor.Room - (2 * PadY)) / lh));
            var to = Math.Min(total, from + fit);
            var chunk = ((to - from) * lh) + (2 * PadY);
            if (fill is { } colour)
            {
                cursor.Page.Add(new FillOp(cursor.G.Margin, cursor.Y - chunk, cursor.Width, chunk, colour));
            }

            var x = cursor.G.Margin;
            for (var column = 0; column < cells.Count; column++)
            {
                var style = styles[column];
                for (var i = from; i < Math.Min(to, cells[column].Count); i++)
                {
                    cursor.Text(cells[column][i], x + PadX, cursor.Y - PadY - Body - ((i - from) * lh) + 1, SizeOf(style.Font), style.Font, style.Colour);
                }

                x += widths[column];
            }

            cursor.Y -= chunk;
            cursor.Page.Add(new LineOp(cursor.G.Margin, cursor.Y, cursor.G.Margin + cursor.Width, cursor.Y, 0.5, ColourName.Rule));
            from = to;
        }
    }

    private static void Signatures(Cursor cursor, IReadOnlyList<string> roles)
    {
        var lh = LineHeight(Body);
        var perRole = SignatureHeight();
        if (cursor.Room < perRole * Math.Min(roles.Count, 3))
        {
            cursor.NewPage();
        }

        foreach (var role in roles)
        {
            if (cursor.Room < perRole)
            {
                cursor.NewPage();
            }

            cursor.Lines([Clean(cursor.Metrics, role, FontSlot.Heading)], H3, FontSlot.Heading, ColourName.Heading);
            foreach (var label in new[] { "Name", "Signature", "Date" })
            {
                cursor.Y -= 14;
                cursor.Text(label, cursor.G.Margin, cursor.Y - Body, Body, FontSlot.Body, ColourName.Muted);
                var lineY = cursor.Y - Body - 2;
                cursor.Page.Add(new LineOp(cursor.G.Margin + (cursor.Width * Label), lineY, cursor.G.Margin + cursor.Width, lineY, 0.6, ColourName.Rule));
                cursor.Y -= lh;
            }

            cursor.Y -= 12;
        }
    }

    private static void Table(Cursor cursor, IReadOnlyList<Column> columns, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var (widths, fonts, header, wrapped) = TableCells(cursor, columns, rows);
        double HeightOf(List<List<string>> cells) => (Math.Max(1, cells.Max(c => c.Count)) * LineHeight(Body)) + (2 * PadY);

        var headerStyles = columns.Select(_ => (FontSlot.BodyBold, ColourName.TableHeaderText)).ToList();
        var bodyStyles = fonts.Select(font => (font, ColourName.Text)).ToList();
        void DrawHeader() => Row(cursor, widths, header, headerStyles, ColourName.TableHeader, () => { });

        // Keep the header with the first row.
        if (cursor.Room < HeightOf(header) + (wrapped.Count > 0 ? HeightOf(wrapped[0]) : 0))
        {
            cursor.NewPage();
        }

        DrawHeader();
        for (var index = 0; index < wrapped.Count; index++)
        {
            Row(cursor, widths, wrapped[index], bodyStyles, index % 2 == 1 ? ColourName.TableStripe : null, DrawHeader);
        }
    }

    private sealed record CoverTitle(
        List<string> Lines,
        double Size,
        List<double> Baselines,
        double RuleY,
        List<double> SubBaselines,
        double Bottom);

    /// <summary>The write position while content pages are laid out.</summary>
    private sealed class Cursor(ITextMetrics metrics, Geometry g, IReadOnlyList<(double Width, double Height)?> images)
    {
        public ITextMetrics Metrics { get; } = metrics;

        public IReadOnlyList<(double Width, double Height)?> Images { get; } = images;

        public Geometry G { get; } = g;

        public List<List<DrawOp>> Pages { get; } = [[]];

        public double Y { get; set; } = g.Height - g.Margin;

        public double Bottom => G.Margin;

        public List<DrawOp> Page => Pages[^1];

        public double Room => Y - Bottom;

        public double Top => G.Height - G.Margin;

        public double Width => G.Width - (2 * G.Margin);

        /// <summary>Draw wrapped lines from the cursor down, breaking pages between lines.</summary>
        public void Lines(IReadOnlyList<string> lines, double size, FontSlot font, ColourName colour, double? x = null)
        {
            var lh = LineHeight(size);
            foreach (var line in lines)
            {
                if (Room < lh)
                {
                    NewPage();
                }

                Text(line, x ?? G.Margin, Y - size, size, font, colour);
                Y -= lh;
            }
        }

        public void NewPage()
        {
            if (Page.Count == 0)
            {
                Y = Top;
                return;
            }

            Pages.Add([]);
            Y = Top;
        }

        public void Text(string text, double x, double y, double size, FontSlot font, ColourName colour)
        {
            if (text.Length > 0)
            {
                Page.Add(new TextOp(text, x, y, size, font, colour));
            }
        }
    }
}
