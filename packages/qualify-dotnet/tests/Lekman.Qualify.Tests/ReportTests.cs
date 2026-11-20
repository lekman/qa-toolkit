using System.Text;
using System.Text.Json.Nodes;
using Lekman.Qualify.Cli;
using Lekman.Qualify.Merge;
using Lekman.Qualify.Report;
using Lekman.Qualify.Theme;
using Lekman.Qualify.Trace;
using Lekman.Qualify.Values;
using UglyToad.PdfPig;
using Xunit;

namespace Lekman.Qualify.Tests;

public class ThemeTests
{
    private static readonly ThemeFilesOnDisk Disk = new();

    [Fact]
    public void BundledThemesAreTheSpecificationsByteForByte()
    {
        var folder = Repo.Spec("report", "themes");
        var onDisk = Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories)
            .Select(f => Path.GetRelativePath(folder, f).Replace('\\', '/'))
            .Where(f => !Path.GetFileName(f).StartsWith('.'))
            .Order(StringComparer.Ordinal)
            .ToList();
        Assert.Equal(onDisk, BundledThemes.Files.Order(StringComparer.Ordinal));
        foreach (var file in onDisk)
        {
            Assert.True(File.ReadAllBytes(Path.Combine(folder, file)).SequenceEqual(BundledThemes.Read(file)!), $"{file} differs from the specification");
        }

        Assert.Null(BundledThemes.Read("nope/theme.json"));
    }

    [Fact]
    public void BothBundledThemesLoad()
    {
        var lekman = ThemeLoader.Load("lekman", "/", Disk);
        Assert.Equal("lekman", lekman.Spec.Name);
        Assert.NotNull(lekman.Logo);
        Assert.Same(lekman.Fonts[FontSlot.BodyBold], lekman.Fonts[FontSlot.Heading]);
        var plain = ThemeLoader.Load("plain", "/", Disk);
        Assert.Null(plain.Logo);
        Assert.Null(plain.Spec.BrandName);
        Assert.Equal(20, plain.Spec.MarginMm);
        Assert.Equal("#1f1f1f", plain.Spec.Colours[ColourName.Accent]);
    }

    [Fact]
    public void AThemeFileLoadsByPathWithItsFilesBesideIt()
    {
        var theme = ThemeLoader.Load(Repo.Spec("report", "themes", "lekman", "theme.json"), "/", Disk);
        Assert.Equal(["Prepared by", "Reviewed by", "Approved by"], theme.Spec.Signatures);
    }

    [Fact]
    public void InvalidThemesAreRefused()
    {
        var dir = Directory.CreateTempSubdirectory("qualify-theme-").FullName;
        try
        {
            var plain = JsonNode.Parse(File.ReadAllText(Repo.Spec("report", "themes", "plain", "theme.json")))!.AsObject();
            string Write(string name, Action<JsonObject> change, string? text = null)
            {
                var copy = plain.DeepClone().AsObject();
                foreach (var slot in new[] { "body", "bodyBold", "heading", "mono" })
                {
                    copy["fonts"]![slot] = Repo.Spec("report", "themes", "plain", (string)plain["fonts"]![slot]!);
                }

                change(copy);
                var path = Path.Combine(dir, name);
                File.WriteAllText(path, text ?? copy.ToJsonString());
                return path;
            }

            Assert.Contains("{nope}", Refused(Repo.Spec("conformance", "fixtures", "bad-theme", "theme.json")), StringComparison.Ordinal);
            Assert.Contains("not valid JSON", Refused(Write("json.json", _ => { }, "{")), StringComparison.Ordinal);
            Assert.Contains("cannot be read", Refused(Path.Combine(dir, "missing.json")), StringComparison.Ordinal);
            Assert.Contains("colours", Refused(Write("colour.json", t => t["colours"]!["text"] = "red")), StringComparison.Ordinal);
            Assert.Contains("may use", Refused(Write("title.json", t => t["texts"]!["title"] = "{title}")), StringComparison.Ordinal);
            File.WriteAllBytes(Path.Combine(dir, "font.ttf"), "not a font"u8.ToArray());
            Assert.Contains("not a TrueType", Refused(Write("font.json", t => t["fonts"]!["mono"] = "font.ttf")), StringComparison.Ordinal);
            Assert.Contains("cannot be read", Refused(Write("nofont.json", t => t["fonts"]!["mono"] = "none.ttf")), StringComparison.Ordinal);
            File.WriteAllBytes(Path.Combine(dir, "logo.png"), "GIF89a"u8.ToArray());
            Assert.Contains("not a PNG or JPEG", Refused(Write("logo.json", t => t["brand"]!["logo"] = "logo.png")), StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public void FontChecksRejectVariableFonts()
    {
        Assert.Equal("is not a TrueType or OpenType font", ThemeLoader.FontProblem([1, 2]));
        byte[] variable = [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, .. "fvar"u8.ToArray(), .. new byte[12]];
        Assert.Equal("is a variable font, which is not supported", ThemeLoader.FontProblem(variable));
        Assert.Null(ThemeLoader.FontProblem(BundledThemes.Read("plain/fonts/NotoSans-Regular.ttf")!));
    }

    [Fact]
    public void TemplatesSubstituteTokensAndEscapeBraces()
    {
        var tokens = Tokens();
        Assert.Equal("{T} Page 2 of 5 }", Template.Render("{{{title}}} Page {page} of {pages} }}", tokens, "2", "5"));
        Assert.Equal("CONF local x y 01HQA1ZQJ0C0NF0RMANCE00000 Passed abcdef123456 - IQ and OQ 2026-01-02", Template.Render("{documentId} {environment} {classification} {unknown}y {runId} {verdict} {sha12} {version} {levels} {date}", tokens with { Classification = "x" }));
        Assert.Contains("not closed", Assert.Throws<ThemeException>(() => Template.Parse("a {b", "w")).Message, StringComparison.Ordinal);
        Assert.Contains("has no", Assert.Throws<ThemeException>(() => Template.Parse("a } b", "w")).Message, StringComparison.Ordinal);
        Template.Validate(new Dictionary<string, string> { ["footer"] = "{page}", ["other"] = "{date}" }, "w");
        Assert.Throws<ThemeException>(() => Template.Validate(new Dictionary<string, string> { ["classification"] = "{title}" }, "w"));
    }

    internal static TokenValues Tokens() => new()
    {
        Title = "T",
        Classification = "",
        DocumentId = "CONF",
        Environment = "local",
        Levels = "IQ and OQ",
        Date = "2026-01-02",
        Version = "-",
        Verdict = "Passed",
        RunId = "01HQA1ZQJ0C0NF0RMANCE00000",
        Sha12 = "abcdef123456",
    };

    private static string Refused(string path) => Assert.Throws<ThemeException>(() => ThemeLoader.Load(path, "/", Disk)).Message;

    private sealed class ThemeFilesOnDisk : IThemeFiles
    {
        public byte[] ReadBytes(string path) => File.ReadAllBytes(path);
    }
}

public class TraceTests
{
    [Fact]
    public void RowsJoinCodeProtocolAndMapLinks()
    {
        var run = Run(
            Records.Test("OQ-CONF-013").Also(t => t["requirements"] = new JsonArray("REQ-1", "REQ-2")),
            Records.Test("OQ-CONF-023").Also(t => t["controls"] = "OQ-CONF-022"),
            Records.Test("OQ-CONF-022", "fail"));
        var protocol = TraceMatrix.Protocol("tests:\n  - id: OQ-CONF-013\n    title: t\n    level: OQ\n    requirements: [REQ-2]\n    risk: high\n  - id: OQ-CONF-099\n    title: missing\n    level: OQ\n", "p.yaml");
        var map = TraceMatrix.Map("OQ-CONF-013: REQ-3\nOQ-CONF-099: [REQ-9]\n", "m.yaml");
        var trace = TraceMatrix.Build(run, protocol, map);
        Assert.Equal(
            ["REQ-1:code:OQ-CONF-013", "REQ-2:code,protocol:OQ-CONF-013", "REQ-3:map:OQ-CONF-013", "REQ-9:map:OQ-CONF-099", ":-:OQ-CONF-022", ":-:OQ-CONF-023"],
            trace.Rows.Select(r => $"{r.Requirement}:{(r.Sources.Count == 0 ? "-" : string.Join(",", r.Sources))}:{r.TestId}"));
        Assert.Equal("high", trace.Rows[0].Risk);
        Assert.Equal(["OQ-CONF-099"], trace.NotRun);
        Assert.Equal(["REQ-9"], trace.RequirementsWithoutPass);
        Assert.Equal("not-run", trace.Rows[3].Outcome);
    }

    [Theory]
    [InlineData("tests: [", "not valid YAML")]
    [InlineData("other: 1", "must have a \"tests\" list")]
    [InlineData("tests:\n  - x", "must be a mapping")]
    [InlineData("tests:\n  - id: OQ-A\n", "id must be a test ID")]
    [InlineData("tests:\n  - id: OQ-AREA-001\n    level: IQ\n", "level must be the prefix")]
    [InlineData("tests:\n  - id: OQ-AREA-001\n    level: OQ\n", "title must not be empty")]
    [InlineData("tests:\n  - id: OQ-AREA-001\n    level: OQ\n    title: t\n    risk: huge\n", "risk must be")]
    [InlineData("tests:\n  - id: OQ-AREA-001\n    level: OQ\n    title: t\n    colour: red\n", "unknown field colour")]
    [InlineData("tests:\n  - id: OQ-AREA-001\n    level: OQ\n    title: t\n  - id: OQ-AREA-001\n    level: OQ\n    title: t\n", "listed twice")]
    [InlineData("tests:\n  - id: OQ-AREA-001\n    level: OQ\n    title: t\n    requirements: [A, A]\n", "a requirement is listed twice")]
    [InlineData("tests:\n  - id: OQ-AREA-001\n    level: OQ\n    title: t\n    requirements: {a: 1}\n", "1 to 64 characters")]
    public void InvalidProtocolsAreRefused(string text, string message) =>
        Assert.Contains(message, Assert.Throws<TraceInputException>(() => TraceMatrix.Protocol(text, "p.yaml")).Message, StringComparison.Ordinal);

    [Fact]
    public void MapsAreRefusedOrEmpty()
    {
        Assert.Empty(TraceMatrix.Map("", "m.yaml"));
        Assert.Contains("must map", Assert.Throws<TraceInputException>(() => TraceMatrix.Map("- a", "m.yaml")).Message, StringComparison.Ordinal);
        Assert.Contains("not a test ID", Assert.Throws<TraceInputException>(() => TraceMatrix.Map("x: a", "m.yaml")).Message, StringComparison.Ordinal);
    }

    internal static JsonObject Run(params JsonObject[] tests)
    {
        var run = Records.Envelope();
        run["startedAt"] = "2026-01-02T03:04:05.006Z";
        run["endedAt"] = "2026-01-02T03:04:05.006Z";
        return new JsonObject
        {
            ["schemaVersion"] = 1,
            ["kind"] = "run",
            ["run"] = run,
            ["summary"] = EvidenceMerge.Summary(tests),
            ["tests"] = new JsonArray([.. tests]),
        };
    }
}

internal static class JsonExtensions
{
    public static JsonObject Also(this JsonObject value, Action<JsonObject> change)
    {
        change(value);
        return value;
    }
}

public class ReportTests
{
    [Fact]
    public void TextsFollowSection92()
    {
        Assert.Equal("?a b\n?", ReportText.Drawable("\u0001a\tb\r\n\u0085", _ => true));
        Assert.Equal("a?", ReportText.Drawable("aä", c => c < 128));
        Assert.Equal("-", ReportText.List([]));
        Assert.Equal("a, b", ReportText.List(["a", "b"]));
        Assert.Equal("2026-01-02 03:04:05 UTC", ReportText.Time("2026-01-02T03:04:05.006Z"));
        Assert.Equal("Incomplete", ReportText.Verdict("incomplete"));
        var longValue = JsonValue.Create(new string('x', 250));
        Assert.EndsWith("… (52 more characters)", ReportText.Json(longValue), StringComparison.Ordinal);
        Assert.Equal("[1]", ReportText.Json(new JsonArray(1)));
    }

    [Fact]
    public void ContentResolvesTokensFlagsAndTheCover()
    {
        var run = TraceTests.Run(
            Records.Test("IQ-ALPHA-001").Also(t => t["requirements"] = new JsonArray("R-1")),
            Records.Test("OQ-BETA-002", "fail").Also(t =>
            {
                t["and"] = new JsonArray("more");
                t["controls"] = "IQ-ALPHA-001";
                t["checks"] = new JsonArray(new JsonObject { ["seq"] = 0, ["context"] = "c", ["description"] = "d", ["matcher"] = "equals", ["expected"] = 1, ["actual"] = 2, ["pass"] = false, ["soft"] = true, ["site"] = "s:1" });
                t["attachments"] = new JsonArray(new JsonObject { ["filename"] = "f", ["contentType"] = "text/plain", ["encoding"] = "base64", ["content"] = "", ["sizeBytes"] = 0, ["sha256"] = new string('0', 64) });
            }),
            Records.Test("PQ-GAMMA-003", "skip"));
        run["run"]!["source"]!["commit"] = new string('a', 40);
        run["run"]!["target"]!["version"] = "1.2.3";
        run["run"]!["mergedRuns"] = new JsonArray(Records.OtherRun);
        run["run"]!["policy"]!["overrides"] = new JsonArray(new JsonObject { ["id"] = "OQ-BETA-002", ["reason"] = "why" });
        var theme = ThemeLoader.Load("plain", "/", new NoFiles()).Spec;
        var input = Input(run, theme, new ReportOptions { GeneratedAt = DateTimeOffset.UnixEpoch, Classification = "Secret", SignaturesGiven = true, Signatures = ["Me"] });
        var document = ReportContent.Build(input);
        Assert.Equal("IQ, OQ and PQ qualification, local environment, 1970-01-01", document.Cover.Subtitle);
        Assert.Equal("Qualification report", document.Cover.Title);
        Assert.Equal(["Document ID", "Date", "Verdict", "Tests", "Environment", "Version", "Commit"], document.Cover.Fields.Select(f => f.Label));
        Assert.Equal("aaaaaaaaaaaa", document.Cover.Fields[^1].Value);
        Assert.Equal("1.2.3", document.Tokens.Version);
        Assert.Equal("QR-local-20260102", document.Tokens.DocumentId);
        Assert.Equal("Secret", document.Classification);
        Assert.IsType<SignaturesBlock>(document.Blocks[^1]);
        Assert.Equal("Fail (soft)", document.Blocks.OfType<TableBlock>().Single(t => t.Columns[0].Header == "#").Rows[0][^1]);
        Assert.Equal("R-1 (code)", document.Blocks.OfType<TableBlock>().Single(t => t.Columns[0].Header == "Requirement").Rows[0][0]);

        var bare = ReportContent.Build(Input(TraceTests.Run(), theme, new ReportOptions { GeneratedAt = DateTimeOffset.UnixEpoch, Subtitle = "S", SignaturesGiven = true }));
        Assert.Equal("-", bare.Tokens.Levels);
        Assert.Equal("S", bare.Cover.Subtitle);
        Assert.IsNotType<SignaturesBlock>(bare.Blocks[^1]);
        Assert.Equal("IQ", ReportContent.LevelsOf([Records.Test("IQ-ALPHA-001")]));
    }

    [Fact]
    public void LayoutWrapsAndFitsText()
    {
        var metrics = new FixedMetrics();
        Assert.Equal(["ab cd", "ef"], ReportLayout.Wrap("ab cd ef", 5, 1, FontSlot.Body, metrics));
        Assert.Equal(["abcde", "fgh"], ReportLayout.Wrap("abcdefgh", 5, 1, FontSlot.Body, metrics));
        Assert.Equal(["a", "", "b"], ReportLayout.Wrap("a\n\nb", 5, 1, FontSlot.Body, metrics));
        Assert.Equal("abc…", ReportLayout.Fit("abcdefgh", 4, 1, FontSlot.Body, metrics));
        Assert.Equal("ab", ReportLayout.Fit("ab", 4, 1, FontSlot.Body, metrics));
        Assert.Equal(string.Empty, ReportLayout.Fit("abcdef", 0, 1, FontSlot.Body, metrics));
        Assert.Equal(612, ReportLayout.GeometryOf(ThemeLoader.Load("plain", "/", new NoFiles()).Spec with { PageSize = "Letter" }).Width);
    }

    [Fact]
    public void LongTablesBreakPagesAndRepeatTheirHeader()
    {
        var metrics = new FixedMetrics();
        var g = new Geometry(200, 200, 20);
        var rows = Enumerable.Range(0, 30).Select(i => (IReadOnlyList<string>)[$"r{i}", "v"]).ToList();
        IReadOnlyList<Block> blocks =
        [
            new HeadingBlock(1, "Title"),
            new FieldsBlock([new Field("Label", "value value value value", Mono: true)]),
            new HeadingBlock(2, "Table"),
            new TableBlock([new Column("A", 0.5), new Column("B", 0.5, Mono: true)], rows),
            new ListBlock(["one", "two"]),
            new HeadingBlock(3, "Small"),
            new ParagraphBlock("None"),
            new TableBlock([new Column("Tall", 1)], [[string.Join("\n", Enumerable.Range(0, 40).Select(i => $"line{i}"))]]),
            new SignaturesBlock(["Prepared by", "Reviewed by"]),
        ];
        var pages = ReportLayout.Paginate(blocks, metrics, g);
        Assert.True(pages.Count > 3);
        var headers = pages.Count(page => page.OfType<TextOp>().Any(t => t.Text == "A"));
        Assert.True(headers > 1, "the table header did not repeat");
        Assert.Contains(pages.SelectMany(p => p).OfType<FillOp>(), f => f.Colour == ColourName.TableStripe);
        var chrome = ReportLayout.PageChrome(new string('h', 300), "Internal", "Page 2 of 3", metrics, g);
        Assert.Contains(chrome.OfType<TextOp>(), t => t.Text.EndsWith('…'));
        var cover = ReportLayout.CoverPage(new Cover("brand", new string('T', 400), "sub", [new Field("Document ID", new string('v', 400))]), (20, 10), metrics, g);
        Assert.Contains(cover, op => op is ImageOp);
        Assert.Contains(cover.OfType<TextOp>(), t => t.Text.EndsWith('…'));
        Assert.DoesNotContain(ReportLayout.CoverPage(new Cover(null, "T", "", [new Field("D", "v")]), null, metrics, g), op => op is ImageOp);
    }

    [Fact]
    public void FontCoverageReadsTheCmap()
    {
        var noto = FontCoverage.Read(BundledThemes.Read("plain/fonts/NotoSans-Regular.ttf")!);
        Assert.Contains('A', noto);
        Assert.Contains(0x0416, noto);
        Assert.DoesNotContain(0x5165, noto);
        var geist = FontCoverage.Read(BundledThemes.Read("lekman/fonts/Geist-Regular.ttf")!);
        Assert.Contains('A', geist);
        Assert.Throws<InvalidDataException>(() => FontCoverage.Read([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    }

    [Fact]
    public void TheReportCommandRendersAPdfWithMetadata()
    {
        var io = new MemoryIO();
        io.Variables["QUALIFY_REPORT_TIME"] = "2026-01-02T03:04:05.006Z";
        var run = TraceTests.Run(Records.Test("PQ-CONF-014").Also(t => t["given"] = "données d’entrée — 入力 Жж"));
        var text = JsonText.Document(run, Lekman.Qualify.Evidence.EvidenceShape.File);
        io.Disk["/work/run.json"] = Encoding.UTF8.GetBytes(text);
        io.Disk["/work/run.json.sha256"] = Encoding.UTF8.GetBytes(Lekman.Qualify.Evidence.EvidenceFiles.Sidecar(Encoding.UTF8.GetBytes(text), "run.json"));
        io.Disk["/work/map.yaml"] = "PQ-CONF-014: R-1\n"u8.ToArray();
        Assert.Equal(0, QualifyCommands.Run(["report", "run.json", "--pdf", "out.pdf", "--map", "map.yaml", "--theme", "plain", "--signatures", "Author; Owner", "--subtitle", "Sub", "--document-id", "DOC-1"], io));
        using var pdf = PdfDocument.Open(io.Files.Files["/work/out.pdf"]);
        Assert.Contains("Lekman.Qualify 0.1.0", pdf.Information.Producer, StringComparison.Ordinal);
        Assert.Equal(Records.RunId, pdf.Information.Subject);
        var words = string.Join(" ", pdf.GetPages().SelectMany(p => p.GetWords()).Select(w => w.Text));
        Assert.Contains("d’entrée", words, StringComparison.Ordinal);
        Assert.Contains("Жж", words, StringComparison.Ordinal);
        Assert.Contains("??", words, StringComparison.Ordinal);
        Assert.Contains("Author", words, StringComparison.Ordinal);
        Assert.Contains("R-1", words, StringComparison.Ordinal);

        var lekman = new MemoryIO { Disk = { ["/work/run.json"] = Encoding.UTF8.GetBytes(text) } };
        lekman.Variables["QUALIFY_REPORT_THEME"] = "lekman";
        Assert.Equal(0, QualifyCommands.Run(["report", "run.json", "--pdf", "l.pdf", "--no-signatures"], lekman));
        Assert.Contains("with theme lekman", lekman.Output.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void TheReportCommandRefusesBadInputWithExit2()
    {
        var run = Encoding.UTF8.GetBytes(JsonText.Document(TraceTests.Run(), Lekman.Qualify.Evidence.EvidenceShape.File));
        string Refused(Action<MemoryIO> setup, params string[] args)
        {
            var io = new MemoryIO();
            io.Disk["/work/run.json"] = run;
            setup(io);
            Assert.Equal(2, QualifyCommands.Run(["report", .. args, "--pdf", "o.pdf"], io));
            Assert.False(io.Files.Files.ContainsKey("/work/o.pdf"));
            return io.Errors.ToString();
        }

        Assert.Contains("UTC instant", Refused(io => io.Variables["QUALIFY_REPORT_TIME"] = "yesterday", "run.json"), StringComparison.Ordinal);
        Assert.Contains("cannot be read", Refused(_ => { }, "run.json", "--theme", "/none/theme.json"), StringComparison.Ordinal);
        Assert.Contains("cannot read", Refused(_ => { }, "missing.json"), StringComparison.Ordinal);
        Assert.Contains("does not match", Refused(io => io.Disk["/work/run.json.sha256"] = "00  run.json\n"u8.ToArray(), "run.json"), StringComparison.Ordinal);
        Assert.Contains("not valid JSON", Refused(io => io.Disk["/work/bad.json"] = "{"u8.ToArray(), "bad.json"), StringComparison.Ordinal);
        Assert.Contains("kind", Refused(io => io.Disk["/work/bad.json"] = "{}"u8.ToArray(), "bad.json"), StringComparison.Ordinal);
        Assert.Contains("expected a run file", Refused(io => io.Disk["/work/rec.json"] = Encoding.UTF8.GetBytes(Records.Record("IQ-ALPHA-001").Text), "rec.json"), StringComparison.Ordinal);
        Assert.Contains("must have a \"tests\" list", Refused(io => io.Disk["/work/p.yaml"] = "x: 1"u8.ToArray(), "run.json", "--protocol", "p.yaml"), StringComparison.Ordinal);
    }

    private static ReportInput Input(JsonObject run, ThemeSpec theme, ReportOptions options) => new()
    {
        Run = run,
        Digest = new string('d', 64),
        Trace = TraceMatrix.Build(run, null, null),
        Theme = theme,
        Producer = "Lekman.Qualify 0.1.0",
        Options = options,
    };

    /// <summary>Every character is one point wide at size 1; every code point is drawable.</summary>
    private sealed class FixedMetrics : ITextMetrics
    {
        public bool CanDraw(int codePoint, FontSlot font) => codePoint != 0x2022;

        public double Width(string text, double size, FontSlot font) => text.EnumerateRunes().Count() * size;
    }

    private sealed class NoFiles : IThemeFiles
    {
        public byte[] ReadBytes(string path) => throw new FileNotFoundException(path);
    }
}
