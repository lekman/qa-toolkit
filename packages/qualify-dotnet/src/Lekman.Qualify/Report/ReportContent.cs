using System.Globalization;
using System.Text.Json.Nodes;
using Lekman.Qualify.Theme;
using Lekman.Qualify.Trace;

namespace Lekman.Qualify.Report;

/// <summary>What the report shows about a run.</summary>
public sealed record ReportInput
{
    /// <summary>The run file.</summary>
    public required JsonObject Run { get; init; }

    /// <summary>The SHA-256 of the run file exactly as read.</summary>
    public required string Digest { get; init; }

    /// <summary>The trace of this run, with the protocol and map applied.</summary>
    public required TraceResult Trace { get; init; }

    /// <summary>The theme file; its texts are the templates.</summary>
    public required ThemeSpec Theme { get; init; }

    /// <summary>The name and version of the tool writing the report.</summary>
    public required string Producer { get; init; }

    /// <summary>What the caller asked for.</summary>
    public required ReportOptions Options { get; init; }
}

/// <summary>
/// The content of the qualification report, section 9.1 of the
/// specification: the cover, the run details, the summary and traceability,
/// one section per test, and the signature block. Pure: the theme decides the
/// texts and the layout comes later.
/// </summary>
public static class ReportContent
{
    private static readonly string[] Levels = ["IQ", "OQ", "PQ", "IU"];
    private static readonly string[] Outcomes = ["pass", "fail", "error", "skip"];

    /// <summary>Build the document.</summary>
    public static ReportDocument Build(ReportInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        var tokens = Tokens(input);
        var options = input.Options;
        var subtitle = options.Subtitle ?? Template.Render(input.Theme.Texts.Subtitle, tokens);
        var roles = options.SignaturesGiven ? options.Signatures : input.Theme.Signatures;
        var tests = Tests(input.Run);

        var blocks = new List<Block> { new HeadingBlock(1, tokens.Title) };
        blocks.AddRange(Details(input));
        blocks.AddRange(Summary(tests, input.Trace));
        var images = new List<ImageSource>();
        foreach (var test in tests)
        {
            blocks.AddRange(Test(test, images));
        }

        if (roles.Count > 0)
        {
            blocks.Add(new HeadingBlock(2, "Signatures"));
            blocks.Add(new SignaturesBlock(roles));
        }

        return new ReportDocument
        {
            Blocks = blocks,
            Classification = tokens.Classification,
            Cover = new Cover(input.Theme.BrandName, tokens.Title, subtitle, CoverFields(input.Theme.CoverFields, tokens, input.Run)),
            Header = input.Theme.Texts.Header,
            Footer = input.Theme.Texts.Footer,
            Tokens = tokens,
            Metadata = new ReportMetadata(tokens.Title, tokens.RunId, $"sha256:{input.Digest}", input.Producer, options.GeneratedAt),
            Images = images,
        };
    }

    /// <summary><c>&lt;total&gt; tests: &lt;pass&gt; pass, &lt;fail&gt; fail, &lt;error&gt; error, &lt;skip&gt; skip</c></summary>
    public static string Counts(JsonNode summary)
    {
        ArgumentNullException.ThrowIfNull(summary);
        return $"{summary["total"]} tests: {summary["pass"]} pass, {summary["fail"]} fail, {summary["error"]} error, {summary["skip"]} skip";
    }

    /// <summary><c>QR-&lt;environment&gt;-&lt;run start date as YYYYMMDD&gt;</c></summary>
    public static string DocumentId(JsonObject run)
    {
        ArgumentNullException.ThrowIfNull(run);
        return $"QR-{run["run"]!["environment"]}-{((string)run["run"]!["startedAt"]!)[..10].Replace("-", string.Empty, StringComparison.Ordinal)}";
    }

    /// <summary>The levels present, in IQ, OQ, PQ, IU order: <c>IQ</c>, <c>IQ and OQ</c>, <c>IQ, OQ and PQ</c>.</summary>
    public static string LevelsOf(IReadOnlyCollection<JsonObject> tests)
    {
        var present = Levels.Where(level => tests.Any(t => (string?)t["level"] == level)).ToList();
        return present.Count switch
        {
            0 => ReportText.Missing,
            1 => present[0],
            _ => $"{string.Join(", ", present[..^1])} and {present[^1]}",
        };
    }

    /// <summary>
    /// Token values for the theme's texts. The classification and the title
    /// are resolved first, from flags or from their templates, so the others
    /// can use them.
    /// </summary>
    public static TokenValues Tokens(ReportInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        var run = input.Run;
        var info = run["run"]!;
        var options = input.Options;
        var baseValues = new TokenValues
        {
            Title = string.Empty,
            Classification = string.Empty,
            DocumentId = options.DocumentId ?? DocumentId(run),
            Environment = (string)info["environment"]!,
            Levels = LevelsOf(Tests(run)),
            Date = options.GeneratedAt.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            Version = Missing((string?)info["target"]?["version"]),
            Verdict = ReportText.Verdict((string)run["summary"]!["verdict"]!),
            RunId = (string)info["id"]!,
            Sha12 = input.Digest[..12],
        };
        return baseValues with
        {
            Classification = options.Classification ?? Template.Render(input.Theme.Texts.Classification, baseValues),
            Title = options.Title ?? Template.Render(input.Theme.Texts.Title, baseValues),
        };
    }

    private static string Missing(string? value) => string.IsNullOrEmpty(value) ? ReportText.Missing : value;

    private static List<JsonObject> Tests(JsonObject run) => [.. ((JsonArray)run["tests"]!).Cast<JsonObject>()];

    private static List<string> Strings(JsonNode? array) =>
        array is JsonArray list ? [.. list.Select(item => (string)item!)] : [];

    private static List<Field> CoverFields(IReadOnlyList<string> fields, TokenValues tokens, JsonObject run)
    {
        var commit = (string?)run["run"]!["source"]!["commit"];
        var rows = new Dictionary<string, Field>(StringComparer.Ordinal)
        {
            ["documentId"] = new("Document ID", tokens.DocumentId),
            ["date"] = new("Date", tokens.Date),
            ["verdict"] = new("Verdict", tokens.Verdict),
            ["tests"] = new("Tests", Counts(run["summary"]!)),
            ["environment"] = new("Environment", tokens.Environment),
            ["version"] = new("Version", tokens.Version),
            ["commit"] = new("Commit", Missing(commit?[..Math.Min(12, commit.Length)])),
            ["classification"] = new("Classification", tokens.Classification),
        };
        return [.. fields.Where(f => f != "classification" || tokens.Classification.Length > 0).Select(f => rows[f])];
    }

    private static IEnumerable<Block> Details(ReportInput input)
    {
        var info = input.Run["run"]!;
        var overrides = ((JsonArray)info["policy"]!["overrides"]!).Select(o => $"{o!["id"]}: {o["reason"]}").ToList();
        yield return new HeadingBlock(2, "Run details");
        yield return new FieldsBlock(
        [
            new("Run ID", (string)info["id"]!, Mono: true),
            new("Run start", ReportText.Time((string)info["startedAt"]!)),
            new("Run end", ReportText.Time((string)info["endedAt"]!)),
            new("Commit", Missing((string?)info["source"]!["commit"]), Mono: true),
            new("Branch", Missing((string?)info["source"]!["branch"])),
            new("Tool", $"{info["tool"]!["name"]} {info["tool"]!["version"]}"),
            new("Generated", ReportText.Time(input.Options.GeneratedAt)),
            new("Run file SHA-256", input.Digest, Mono: true),
            new("Merged runs", ReportText.List(Strings(info["mergedRuns"])), Mono: true),
            new("Write overrides", ReportText.List(overrides)),
        ]);
    }

    private static Block List(IReadOnlyList<string> items) =>
        items.Count == 0 ? new ParagraphBlock("None") : new ListBlock(items);

    private static IEnumerable<Block> Summary(List<JsonObject> tests, TraceResult trace)
    {
        IReadOnlyList<string> Row(string label, IReadOnlyCollection<JsonObject> subset) =>
            [label, subset.Count.ToString(CultureInfo.InvariantCulture), .. Outcomes.Select(o => subset.Count(t => (string?)t["outcome"] == o).ToString(CultureInfo.InvariantCulture))];

        var titles = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var row in trace.Rows)
        {
            titles[row.TestId] = row.Title;
        }

        yield return new HeadingBlock(2, "Summary");
        yield return new TableBlock(
            [new("Level", 0.2), new("Total", 0.16), new("Pass", 0.16), new("Fail", 0.16), new("Error", 0.16), new("Skip", 0.16)],
            [.. Levels.Select(level => Row(level, [.. tests.Where(t => (string?)t["level"] == level)])), Row("All", tests)]);
        yield return new HeadingBlock(2, "Traceability");
        yield return new TableBlock(
            [new("Requirement", 0.2), new("Test ID", 0.19, Mono: true), new("Level", 0.08), new("Title", 0.3), new("Risk", 0.09), new("Outcome", 0.14)],
            [.. trace.Rows.Select(r => (IReadOnlyList<string>)
            [
                r.Requirement is null ? ReportText.Missing : $"{r.Requirement} ({string.Join(", ", r.Sources)})",
                r.TestId,
                r.Level,
                r.Title,
                Missing(r.Risk),
                r.Outcome,
            ])]);
        yield return new HeadingBlock(3, "Not run");
        yield return List([.. trace.NotRun.Select(id => $"{id} {titles.GetValueOrDefault(id) ?? string.Empty}".Trim())]);
        yield return new HeadingBlock(3, "Requirements without a passing test");
        yield return List(trace.RequirementsWithoutPass);
    }

    private static List<Block> Test(JsonObject test, List<ImageSource> images)
    {
        var blocks = new List<Block>();
        var controls = (string?)test["controls"];
        var fields = new List<Field>
        {
            new("Level", (string)test["level"]!),
            new("Outcome", (string)test["outcome"]!),
            new("Risk", Missing((string?)test["risk"])),
            new("Scope", (string)test["scope"]!),
            new("Requirements", ReportText.List(Strings(test["requirements"]))),
            new("Tags", ReportText.List(Strings(test["tags"]))),
            new("Controls", Missing(controls), Mono: controls is not null),
        };
        if ((string?)test["skipReason"] is { } reason)
        {
            fields.Add(new("Skip reason", reason));
        }

        if (test["error"] is JsonObject error)
        {
            fields.Add(new("Error type", (string)error["type"]!));
            fields.Add(new("Error message", (string)error["message"]!));
        }

        fields.Add(new("Given", (string)test["given"]!));
        fields.Add(new("When", (string)test["when"]!));
        fields.Add(new("Then", (string)test["then"]!));
        fields.AddRange(Strings(test["and"]).Select(clause => new Field("And", clause)));
        fields.Add(new("Started", ReportText.Time((string)test["startedAt"]!)));
        fields.Add(new("Duration", $"{test["durationMs"]} ms"));
        fields.Add(new("Secrets used", ReportText.List(Strings(test["secretsUsed"]))));

        blocks.Add(new HeadingBlock(2, $"{test["id"]} {test["title"]}"));
        blocks.Add(new FieldsBlock(fields));
        blocks.Add(new HeadingBlock(3, "Checks"));
        var checks = ((JsonArray)test["checks"]!).Cast<JsonObject>().ToList();
        blocks.Add(checks.Count == 0
            ? new ParagraphBlock("None")
            : new TableBlock(
                [new("#", 0.05), new("Context", 0.13), new("Description", 0.21), new("Matcher", 0.11), new("Expected", 0.18, Mono: true), new("Actual", 0.18, Mono: true), new("Result", 0.14)],
                [.. checks.Select(c => (IReadOnlyList<string>)
                [
                    ((int)c["seq"]! + 1).ToString(CultureInfo.InvariantCulture),
                    (string)c["context"]!,
                    (string)c["description"]!,
                    (string)c["matcher"]!,
                    ReportText.Json(c["expected"]),
                    ReportText.Json(c["actual"]),
                    ((bool)c["pass"]! ? "Pass" : "Fail") + ((bool)c["soft"]! ? " (soft)" : string.Empty),
                ])]));
        blocks.Add(new HeadingBlock(3, "Attachments"));
        var attachments = ((JsonArray)test["attachments"]!).Cast<JsonObject>().ToList();
        blocks.Add(attachments.Count == 0
            ? new ParagraphBlock("None")
            : new TableBlock(
                [new("File", 0.2), new("Content type", 0.2), new("Size", 0.12), new("SHA-256", 0.48, Mono: true)],
                [.. attachments.Select(a => (IReadOnlyList<string>)[(string)a["filename"]!, (string)a["contentType"]!, $"{a["sizeBytes"]} bytes", (string)a["sha256"]!])]));

        // Each PNG and JPEG attachment, in the order attached, below the table.
        foreach (var attachment in attachments)
        {
            if (ReportImages.Format((string)attachment["contentType"]!) is { } format)
            {
                images.Add(new ImageSource(Convert.FromBase64String((string)attachment["content"]!), format));
                blocks.Add(new ImageBlock(images.Count - 1, ReportImages.Caption(attachment), ReportImages.Unreadable(attachment)));
            }
        }

        return blocks;
    }
}
