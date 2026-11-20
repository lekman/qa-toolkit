using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace Lekman.Qualify.Theme;

/// <summary>The four font slots of a theme.</summary>
public enum FontSlot
{
    /// <summary>Body text.</summary>
    Body,

    /// <summary>Labels and table headers.</summary>
    BodyBold,

    /// <summary>The title and headings.</summary>
    Heading,

    /// <summary>IDs, digests, expected and actual values.</summary>
    Mono,
}

/// <summary>Colour names a theme defines, section 9.3 of the specification.</summary>
public enum ColourName
{
    /// <summary>Body text.</summary>
    Text,

    /// <summary>Secondary text: the header, the footer, cover values.</summary>
    Muted,

    /// <summary>The title.</summary>
    Title,

    /// <summary>Level 2 and 3 headings.</summary>
    Heading,

    /// <summary>The rule under the cover title and the level 1 heading.</summary>
    Accent,

    /// <summary>Hairlines.</summary>
    Rule,

    /// <summary>The table header row's fill.</summary>
    TableHeader,

    /// <summary>The table header row's text.</summary>
    TableHeaderText,

    /// <summary>Every second body row's fill.</summary>
    TableStripe,
}

/// <summary>The texts of a theme: templates.</summary>
public sealed record ThemeTexts(string Title, string Subtitle, string Classification, string Header, string Footer);

/// <summary><c>theme.json</c>, as <c>report-theme.schema.json</c> defines it.</summary>
public sealed record ThemeSpec
{
    /// <summary>The theme's short name.</summary>
    public required string Name { get; init; }

    /// <summary><c>A4</c> or <c>Letter</c>.</summary>
    public required string PageSize { get; init; }

    /// <summary>The page margin in millimetres.</summary>
    public required double MarginMm { get; init; }

    /// <summary>The logo file, relative to the theme file, or null.</summary>
    public string? Logo { get; init; }

    /// <summary>The logo height in millimetres.</summary>
    public required double LogoHeightMm { get; init; }

    /// <summary>The brand name beside the logo, or null.</summary>
    public string? BrandName { get; init; }

    /// <summary>The font file of each slot, relative to the theme file.</summary>
    public required IReadOnlyDictionary<FontSlot, string> Fonts { get; init; }

    /// <summary>Each colour as <c>#rrggbb</c>.</summary>
    public required IReadOnlyDictionary<ColourName, string> Colours { get; init; }

    /// <summary>The text templates.</summary>
    public required ThemeTexts Texts { get; init; }

    /// <summary>The cover's metadata rows, in order.</summary>
    public required IReadOnlyList<string> CoverFields { get; init; }

    /// <summary>The signature roles, in order.</summary>
    public required IReadOnlyList<string> Signatures { get; init; }

    /// <summary>Read a theme file that passed the schema.</summary>
    public static ThemeSpec FromJson(JsonObject json)
    {
        ArgumentNullException.ThrowIfNull(json);
        string Text(JsonNode? node) => node!.GetValue<string>();
        var fonts = json["fonts"]!;
        var colours = json["colours"]!;
        var texts = json["texts"]!;
        return new ThemeSpec
        {
            Name = Text(json["name"]),
            PageSize = Text(json["page"]!["size"]),
            MarginMm = json["page"]!["marginMm"]!.GetValue<double>(),
            Logo = json["brand"]!["logo"]?.GetValue<string>(),
            LogoHeightMm = json["brand"]!["logoHeightMm"]!.GetValue<double>(),
            BrandName = json["brand"]!["name"]?.GetValue<string>(),
            Fonts = new Dictionary<FontSlot, string>
            {
                [FontSlot.Body] = Text(fonts["body"]),
                [FontSlot.BodyBold] = Text(fonts["bodyBold"]),
                [FontSlot.Heading] = Text(fonts["heading"]),
                [FontSlot.Mono] = Text(fonts["mono"]),
            },
            Colours = Enum.GetValues<ColourName>().ToDictionary(
                name => name,
                name => Text(colours[char.ToLowerInvariant(name.ToString()[0]) + name.ToString()[1..]])),
            Texts = new ThemeTexts(Text(texts["title"]), Text(texts["subtitle"]), Text(texts["classification"]), Text(texts["header"]), Text(texts["footer"])),
            CoverFields = [.. ((JsonArray)json["cover"]!["fields"]!).Select(Text)],
            Signatures = [.. ((JsonArray)json["signatures"]!).Select(Text)],
        };
    }
}

/// <summary>A theme with its files read, ready to draw with.</summary>
public sealed record ReportTheme
{
    /// <summary>The parsed theme file.</summary>
    public required ThemeSpec Spec { get; init; }

    /// <summary>The font bytes per slot. Slots naming the same file share one array.</summary>
    public required IReadOnlyDictionary<FontSlot, byte[]> Fonts { get; init; }

    /// <summary>The logo bytes, PNG or JPEG, or null.</summary>
    public byte[]? Logo { get; init; }
}

/// <summary>Validation against <c>spec/qualify/report-theme.schema.json</c>, embedded as it is.</summary>
public static class ThemeSchema
{
    private static readonly Lazy<JsonSchema> Schema = new(() =>
    {
        using var stream = typeof(ThemeSchema).Assembly.GetManifestResourceStream("Lekman.Qualify.report-theme.schema.json")
            ?? throw new InvalidOperationException("the report theme schema is not embedded in Lekman.Qualify");
        using var reader = new StreamReader(stream);
        return JsonSchema.FromText(reader.ReadToEnd());
    });

    /// <summary>The schema's problems with a theme, or an empty list when it is valid.</summary>
    public static IReadOnlyList<string> Problems(JsonNode? theme)
    {
        using var parsed = JsonDocument.Parse(theme?.ToJsonString() ?? "null");
        var results = Schema.Value.Evaluate(parsed.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List });
        if (results.IsValid)
        {
            return [];
        }

        var problems = (results.Details ?? [])
            .Where(d => d.Errors is not null)
            .SelectMany(d => d.Errors!.Select(e => $"{(d.InstanceLocation.ToString() is { Length: > 0 } at ? at : "/")}: {e.Key}: {e.Value}"))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        return problems.Count > 0 ? problems : ["/: does not match the report theme schema"];
    }
}
