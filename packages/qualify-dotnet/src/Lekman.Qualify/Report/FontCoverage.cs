namespace Lekman.Qualify.Report;

/// <summary>
/// The code points a TrueType or OpenType font maps to a glyph, read from its
/// <c>cmap</c> table (format 12 for the full range, else format 4 for the
/// Basic Multilingual Plane). A character the font cannot draw is drawn as
/// <c>?</c>, as section 9.2 of the specification asks.
/// </summary>
public static class FontCoverage
{
    /// <summary>Every code point the font maps to a glyph other than the missing glyph.</summary>
    public static HashSet<int> Read(byte[] font)
    {
        ArgumentNullException.ThrowIfNull(font);
        var cmap = Table(font, "cmap") ?? throw new InvalidDataException("the font has no cmap table");
        var count = U16(font, cmap + 2);
        int? format12 = null;
        int? format4 = null;
        for (var i = 0; i < count; i++)
        {
            var record = cmap + 4 + (8 * i);
            var platform = U16(font, record);
            var encoding = U16(font, record + 2);
            var offset = cmap + (int)U32(font, record + 4);
            var format = U16(font, offset);
            if (format == 12 && (platform == 0 || (platform == 3 && encoding == 10)))
            {
                format12 ??= offset;
            }
            else if (format == 4 && (platform == 0 || (platform == 3 && encoding is 1 or 0)))
            {
                format4 ??= offset;
            }
        }

        if (format12 is { } full)
        {
            return Format12(font, full);
        }

        return format4 is { } bmp ? Format4(font, bmp) : throw new InvalidDataException("the font has no Unicode cmap subtable");
    }

    private static HashSet<int> Format12(byte[] font, int at)
    {
        var result = new HashSet<int>();
        var groups = U32(font, at + 12);
        for (var g = 0L; g < groups; g++)
        {
            var group = at + 16 + (int)(12 * g);
            var start = U32(font, group);
            var end = U32(font, group + 4);
            var glyph = U32(font, group + 8);
            for (var code = start; code <= end && code <= 0x10FFFF; code++)
            {
                if (glyph + (code - start) != 0)
                {
                    result.Add((int)code);
                }
            }
        }

        return result;
    }

    private static HashSet<int> Format4(byte[] font, int at)
    {
        var result = new HashSet<int>();
        var segments = U16(font, at + 6) / 2;
        var ends = at + 14;
        var starts = ends + (2 * segments) + 2;
        var deltas = starts + (2 * segments);
        var offsets = deltas + (2 * segments);
        for (var s = 0; s < segments; s++)
        {
            var end = U16(font, ends + (2 * s));
            var start = U16(font, starts + (2 * s));
            var delta = (short)U16(font, deltas + (2 * s));
            var rangeOffset = U16(font, offsets + (2 * s));
            for (var code = start; code <= end && code != 0xFFFF; code++)
            {
                int glyph;
                if (rangeOffset == 0)
                {
                    glyph = (code + delta) & 0xFFFF;
                }
                else
                {
                    var address = offsets + (2 * s) + rangeOffset + (2 * (code - start));
                    glyph = address + 1 < font.Length ? U16(font, address) : 0;
                    if (glyph != 0)
                    {
                        glyph = (glyph + delta) & 0xFFFF;
                    }
                }

                if (glyph != 0)
                {
                    result.Add(code);
                }
            }
        }

        return result;
    }

    private static int? Table(byte[] font, string tag)
    {
        var tables = U16(font, 4);
        for (var i = 0; i < tables; i++)
        {
            var record = 12 + (16 * i);
            if (System.Text.Encoding.ASCII.GetString(font, record, 4) == tag)
            {
                return (int)U32(font, record + 8);
            }
        }

        return null;
    }

    private static int U16(byte[] bytes, int at) => (bytes[at] << 8) | bytes[at + 1];

    private static long U32(byte[] bytes, int at) =>
        ((long)bytes[at] << 24) | ((long)bytes[at + 1] << 16) | ((long)bytes[at + 2] << 8) | bytes[at + 3];
}
