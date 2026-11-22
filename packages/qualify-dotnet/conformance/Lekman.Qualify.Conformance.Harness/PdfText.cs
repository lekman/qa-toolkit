using System.Globalization;
using System.Text.RegularExpressions;
using UglyToad.PdfPig;

namespace Lekman.Qualify.Conformance.Harness;

/// <summary>The extracted text and document information of a PDF.</summary>
public sealed record PdfContent(IReadOnlyList<IReadOnlyList<string>> PageLines, IReadOnlyDictionary<string, string?> Info)
{
    /// <summary>Every line, page after page.</summary>
    public IReadOnlyList<string> Lines => [.. PageLines.SelectMany(page => page)];
}

/// <summary>
/// Text extraction with PdfPig, for scenarios 21, 22 and 23. Text on one baseline
/// of a page becomes one line, left to right. Runs of whitespace collapse to
/// one space and empty lines are dropped, as scenario 21 describes.
/// </summary>
public static partial class PdfText
{
    /// <summary>Extract the lines of every page and the document information.</summary>
    public static PdfContent Extract(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        var pages = new List<IReadOnlyList<string>>();
        foreach (var page in document.GetPages())
        {
            var lines = page.GetWords()
                .GroupBy(word => Math.Round(word.Letters[0].StartBaseLine.Y, 1))
                .OrderByDescending(group => group.Key)
                .Select(group => Space().Replace(string.Join(' ', group.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text)), " ").Trim())
                .Where(line => line.Length > 0)
                .ToList();
            pages.Add(lines);
        }

        var info = document.Information;
        return new PdfContent(pages, new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            ["Title"] = info.Title,
            ["Subject"] = info.Subject,
            ["Keywords"] = info.Keywords,
            ["Producer"] = info.Producer,
            ["CreationDate"] = info.CreationDate,
        });
    }

    /// <summary>
    /// The first outline line that is not found in order, or null. A line is
    /// found when it is part of an extracted line, at or after the end of the
    /// previous match.
    /// </summary>
    public static string? MissingFromOutline(IReadOnlyList<string> lines, IEnumerable<string> outline)
    {
        var at = 0;
        var offset = 0;
        foreach (var wanted in outline)
        {
            var found = false;
            for (; at < lines.Count; at++, offset = 0)
            {
                var index = lines[at].IndexOf(wanted, offset, StringComparison.Ordinal);
                if (index >= 0)
                {
                    offset = index + wanted.Length;
                    found = true;
                    break;
                }
            }

            if (!found)
            {
                return wanted;
            }
        }

        return null;
    }

    /// <summary>
    /// The images each page places, as <c>WIDTHxHEIGHT</c> in pixels, for
    /// scenario 23. PdfPig lists the image XObjects the page's content draws
    /// from its resources. A transparency mask hangs off its image, not off
    /// the page, so it is not listed.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<string>> PlacedImages(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return [.. document.GetPages().Select(page => (IReadOnlyList<string>)[.. page.GetImages().Select(image =>
            string.Create(CultureInfo.InvariantCulture, $"{image.WidthInSamples}x{image.HeightInSamples}"))])];
    }

    /// <summary>The lines of an outline file, whitespace collapsed, empty lines dropped.</summary>
    public static IReadOnlyList<string> Outline(string path) =>
        [.. File.ReadAllLines(path).Select(line => Space().Replace(line, " ").Trim()).Where(line => line.Length > 0)];

    /// <summary>A PDF date string such as <c>D:20260102030405Z</c> as its first 16 characters.</summary>
    public static string DatePrefix(string? date) =>
        date is null ? string.Empty : date[..Math.Min(16, date.Length)].ToString(CultureInfo.InvariantCulture);

    [GeneratedRegex(@"\s+")]
    private static partial Regex Space();
}
