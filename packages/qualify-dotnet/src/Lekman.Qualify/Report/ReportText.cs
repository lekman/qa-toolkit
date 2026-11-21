using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Lekman.Qualify.Values;

namespace Lekman.Qualify.Report;

/// <summary>How values are written in the report, section 9.2 of the specification.</summary>
public static class ReportText
{
    /// <summary>Shown for a value that is missing.</summary>
    public const string Missing = "-";

    private const int Cut = 200;

    /// <summary>
    /// Replace every character the font cannot draw with <c>?</c>. Tabs
    /// become spaces; line breaks stay, for the layout to split on.
    /// </summary>
    public static string Drawable(string text, Func<int, bool> canDraw)
    {
        ArgumentNullException.ThrowIfNull(text);
        ArgumentNullException.ThrowIfNull(canDraw);
        var result = new StringBuilder(text.Length);
        foreach (var rune in text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Replace('\t', ' ').EnumerateRunes())
        {
            var code = rune.Value;
            if (code == '\n')
            {
                result.Append('\n');
            }
            else if (code < 0x20 || (code >= 0x7F && code < 0xA0))
            {
                result.Append('?');
            }
            else
            {
                result.Append(canDraw(code) ? rune.ToString() : "?");
            }
        }

        return result.ToString();
    }

    /// <summary>A value as compact JSON, cut after 200 code points.</summary>
    public static string Json(JsonNode? value)
    {
        var text = JsonText.Compact(value);
        var runes = text.EnumerateRunes().ToList();
        if (runes.Count <= Cut)
        {
            return text;
        }

        return string.Concat(runes.Take(Cut).Select(r => r.ToString())) + $"… ({runes.Count - Cut} more characters)";
    }

    /// <summary>A list, or <c>-</c> when it is empty.</summary>
    public static string List(IReadOnlyCollection<string> values) =>
        values.Count == 0 ? Missing : string.Join(", ", values);

    /// <summary>A timestamp as <c>YYYY-MM-DD HH:MM:SS UTC</c>.</summary>
    public static string Time(DateTimeOffset value) =>
        value.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + " UTC";

    /// <summary>A timestamp string of the schema's format as <c>YYYY-MM-DD HH:MM:SS UTC</c>.</summary>
    public static string Time(string value) =>
        Time(DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal));

    /// <summary>The verdict in words.</summary>
    public static string Verdict(string verdict) => verdict switch
    {
        "pass" => "Passed",
        "fail" => "Failed",
        _ => "Incomplete",
    };
}
