using System.Text;
using System.Text.Json.Nodes;
using Lekman.Qualify.Declarations;
using Lekman.Qualify.Envelope;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Redaction;
using Lekman.Qualify.Settings;
using Xunit;

namespace Lekman.Qualify.Tests;

public class RedactionTests
{
    private static readonly string Pem = "-----BEGIN RSA PRIVATE" + " KEY-----\nabc\n-----END RSA PRIVATE KEY-----";

    [Fact]
    public void RegisteredValuesAreReplacedLongestFirst() =>
        Assert.Equal("x [REDACTED] y", Redactor.Text("x secret-value-long y", ["secret-value", "secret-value-long"]));

    [Fact]
    public void PatternsAreReplacedWithoutRegistration()
    {
        Assert.Equal("a [REDACTED] b", Redactor.Text($"a {Pem} b", []));
        Assert.Equal("cut [REDACTED]", Redactor.Text("cut -----BEGIN PRIVATE" + " KEY-----\nno end", []));
        Assert.Equal("[REDACTED]", Redactor.Text("eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2ln", []));
        Assert.Equal("k=[REDACTED];", Redactor.Text("k=AS" + "IAABCDEFGHIJKLMNOP;", []));
        Assert.Equal("plain text", Redactor.ApplyPatterns("plain text"));
    }

    [Fact]
    public void BytesAreRedactedWithoutChangingTheBytesAround()
    {
        byte[] bytes = [0x00, 0xFF, .. Encoding.UTF8.GetBytes("tökén-value"), 0x00];
        Assert.Equal([0x00, 0xFF, .. "[REDACTED]"u8.ToArray(), 0x00], Redactor.Bytes(bytes, ["tökén-value"]));
        byte[] clean = [1, 2, 3];
        Assert.Same(clean, Redactor.Bytes(clean, ["nothing-here"]));
    }

    [Fact]
    public void JsonRedactsSensitiveKeysWholeAndEverythingElseAsText()
    {
        var value = JsonNode.Parse("{\"Password\":{\"a\":1},\"api_key\":\"k\",\"list\":[\"x my-secret\"],\"my-secret\":2}");
        Assert.Equal(
            "{\"Password\":\"[REDACTED]\",\"[REDACTED]\":2,\"api_key\":\"[REDACTED]\",\"list\":[\"x [REDACTED]\"]}",
            Lekman.Qualify.Values.JsonText.Compact(Redactor.Json(value, ["my-secret"])));
        Assert.Equal("[1,true,null]", Lekman.Qualify.Values.JsonText.Compact(Redactor.Value(JsonNode.Parse("[1,true,null]"), [])));
        Assert.Null(Redactor.Value(null, []));
    }
}

public class DeclarationTests
{
    private static DeclarationInput Valid(string level = "OQ", string id = "OQ-EXPORT-003") => new()
    {
        Level = level,
        Id = id,
        Title = "The bank file never changes an amount",
        Given = "g",
        When = "w",
        Then = "t",
        Scope = Scope.Read,
    };

    [Fact]
    public void AValidDeclarationKeepsItsFields()
    {
        var declaration = DeclarationRules.Validate(
            Valid() with { And = ["more"], Requirements = ["EXPORT-003"], Risk = Risk.High, Tags = ["b", "a", "b"], Controls = "OQ-EXPORT-004" },
            "file.cs:3");
        Assert.Equal(["a", "b"], declaration.Tags);
        Assert.Equal("high", declaration.Risk);
        Assert.Equal("read", declaration.Scope);
        Assert.Equal(
            "{\"and\":[\"more\"],\"controls\":\"OQ-EXPORT-004\",\"given\":\"g\",\"id\":\"OQ-EXPORT-003\",\"level\":\"OQ\",\"requirements\":[\"EXPORT-003\"],\"risk\":\"high\",\"scope\":\"read\",\"site\":\"file.cs:3\",\"tags\":[\"a\",\"b\"],\"then\":\"t\",\"title\":\"The bank file never changes an amount\",\"when\":\"w\"}",
            Lekman.Qualify.Values.JsonText.Compact(declaration.ToJson()));
    }

    [Theory]
    [InlineData("IQ", "read")]
    [InlineData("IU", "read-write")]
    public void IqAndIuHaveAFixedScope(string level, string scope)
    {
        var declaration = DeclarationRules.Validate(Valid(level, $"{level}-EXPORT-001") with { Scope = Scope.NotSet }, "f:1");
        Assert.Equal(scope, declaration.Scope);
        var error = Assert.Throws<DeclarationException>(() => DeclarationRules.Validate(Valid(level, $"{level}-EXPORT-001"), "f:1"));
        Assert.Contains("scope must not be declared", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void EveryProblemIsReportedAtOnce()
    {
        var error = Assert.Throws<DeclarationException>(() => DeclarationRules.Validate(
            new DeclarationInput
            {
                Level = "OQ",
                Id = "OQ-conf-009",
                Title = "two\nlines",
                And = [" "],
                Requirements = ["R", "R", new string('x', 65)],
                Tags = [""],
                Controls = "nope",
                Risk = (Risk)42,
                Scope = (Scope)42,
            },
            "f:1"));
        Assert.Equal("OQ-conf-009", error.TestId);
        foreach (var expected in new[] { "pattern", "one line", "given", "when", "then", "and must be", "scope must be", "1 to 64", "duplicated: R", "tags must", "risk must", "controls must" })
        {
            Assert.Contains(error.Problems, p => p.Contains(expected, StringComparison.Ordinal));
        }
    }

    [Fact]
    public void LevelAndScopeProblems()
    {
        Assert.Contains("level", Assert.Throws<DeclarationException>(() => DeclarationRules.Validate(Valid(id: "IQ-CONF-010"), "f:1")).Message, StringComparison.Ordinal);
        Assert.Contains("scope is required", Assert.Throws<DeclarationException>(() => DeclarationRules.Validate(Valid() with { Scope = Scope.NotSet }, "f:1")).Message, StringComparison.Ordinal);
        Assert.Contains("unknown level", Assert.Throws<DeclarationException>(() => DeclarationRules.Validate(Valid("XQ"), "f:1")).Message, StringComparison.Ordinal);
        Assert.Contains("control for itself", Assert.Throws<DeclarationException>(() => DeclarationRules.Validate(Valid() with { Controls = "OQ-EXPORT-003" }, "f:1")).Message, StringComparison.Ordinal);
        Assert.Contains("(no ID)", Assert.Throws<DeclarationException>(() => DeclarationRules.Validate(Valid() with { Id = null, Title = null }, "f:1")).Message, StringComparison.Ordinal);
        Assert.Equal("[OQ-X-001] t", DeclarationRules.DisplayName("OQ-X-001", "t"));
    }
}

public class SettingsTests
{
    private static Dictionary<string, string> Env(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);

    [Fact]
    public void DefaultsApplyWhenNothingIsSet()
    {
        var settings = SettingsResolver.Resolve(Env());
        Assert.Equal("local", settings.Environment);
        Assert.False(settings.ProductionWriteBlocked);
        Assert.Equal(1024 * 1024, settings.AttachmentLimit);
        Assert.Equal("qualification/evidence", settings.EvidenceDir);
        Assert.Null(settings.ReadSecret("X"));
    }

    [Fact]
    public void VariablesWinOverOptions()
    {
        var settings = SettingsResolver.Resolve(
            Env(("QUALIFY_ENVIRONMENT", " prod "), ("QUALIFY_ATTACHMENT_LIMIT", "16"), ("QUALIFY_EVIDENCE_DIR", "/e"), ("QUALIFY_SECRET_T", "v"), ("QUALIFY_ALLOW_WRITE", "OQ-AREA-001=why; IQ-BETA-002 = because")),
            new QualifyOptions { Environment = "dev", AttachmentLimit = 3, EvidenceDir = "/o" });
        Assert.Equal("prod", settings.Environment);
        Assert.True(settings.ProductionWriteBlocked);
        Assert.Equal(16, settings.AttachmentLimit);
        Assert.Equal("/e", settings.EvidenceDir);
        Assert.Equal("v", settings.ReadSecret("T"));
        Assert.Equal([new PolicyOverride("OQ-AREA-001", "why"), new PolicyOverride("IQ-BETA-002", "because")], settings.Overrides);
    }

    [Fact]
    public void OptionsApplyWhenVariablesAreUnset()
    {
        var settings = SettingsResolver.Resolve(
            Env(("QUALIFY_ENVIRONMENT", " ")),
            new QualifyOptions
            {
                Environment = "stage",
                Production = ["stage", " "],
                AllowWrite = new Dictionary<string, string> { ["OQ-AREA-001"] = "ok" },
                AttachmentLimit = 3,
                EvidenceDir = "/o",
                SecretSource = name => name + "!",
                NotApplicable = [new NotApplicableRule { Reason = "n/a" }],
            });
        Assert.Equal("stage", settings.Environment);
        Assert.True(settings.ProductionWriteBlocked);
        Assert.Single(settings.Overrides);
        Assert.Equal(3, settings.AttachmentLimit);
        Assert.Equal("/o", settings.EvidenceDir);
        Assert.Equal("T!", settings.ReadSecret("T"));
        Assert.Single(settings.NotApplicable);
    }

    [Fact]
    public void AResolverThatFailsMeansProduction()
    {
        Assert.Equal("production", SettingsResolver.Environment(Env(), new QualifyOptions { ResolveEnvironment = () => throw new InvalidOperationException() }));
        Assert.Equal("production", SettingsResolver.Environment(Env(), new QualifyOptions { ResolveEnvironment = () => " " }));
        Assert.Equal("qa", SettingsResolver.Environment(Env(("QUALIFY_ENVIRONMENT", "x")), new QualifyOptions { ResolveEnvironment = () => " qa " }));
    }

    [Theory]
    [InlineData("QUALIFY_ALLOW_WRITE", "nope=x", "not a test ID")]
    [InlineData("QUALIFY_ALLOW_WRITE", "OQ-AREA-001", "no reason")]
    [InlineData("QUALIFY_ALLOW_WRITE", "OQ-AREA-001=a;OQ-AREA-001=b", "twice")]
    [InlineData("QUALIFY_ATTACHMENT_LIMIT", "-1", "whole number")]
    [InlineData("QUALIFY_ATTACHMENT_LIMIT", "1.5", "whole number")]
    public void InvalidSettingsThrow(string name, string value, string message) =>
        Assert.Contains(message, Assert.Throws<ConfigurationException>(() => SettingsResolver.Resolve(Env((name, value)))).Message, StringComparison.Ordinal);

    [Fact]
    public void NoOverridesRefusesOverrides()
    {
        Assert.Throws<ConfigurationException>(() => SettingsResolver.Resolve(Env(("QUALIFY_NO_OVERRIDES", "yes"), ("QUALIFY_ALLOW_WRITE", "OQ-AREA-001=x"))));
        Assert.Throws<ConfigurationException>(() => SettingsResolver.Resolve(Env(("QUALIFY_ALLOW_WRITE", "OQ-AREA-001=x")), new QualifyOptions { NoOverrides = true }));
        Assert.Throws<ConfigurationException>(() => SettingsResolver.Resolve(Env(), new QualifyOptions { AttachmentLimit = -1 }));
        Assert.Empty(SettingsResolver.Resolve(Env(("QUALIFY_NO_OVERRIDES", "0"))).Overrides);
    }

    [Fact]
    public void PolicyBlocksWritesInProductionAndAppliesRules()
    {
        var declaration = DeclarationRules.Validate(new DeclarationInput { Level = "IU", Id = "IU-AREA-001", Title = "t", Given = "g", When = "w", Then = "t", Tags = ["slow"] }, "f:1");
        var production = SettingsResolver.Resolve(Env(("QUALIFY_ENVIRONMENT", "production")));
        Assert.Equal("read-write test blocked in production environment production", Policy.SkipReason(declaration, production));
        var allowed = SettingsResolver.Resolve(Env(("QUALIFY_ENVIRONMENT", "production"), ("QUALIFY_ALLOW_WRITE", "IU-AREA-001=ok")));
        Assert.Null(Policy.SkipReason(declaration, allowed));
        var rules = SettingsResolver.Resolve(Env(), new QualifyOptions
        {
            NotApplicable =
            [
                new NotApplicableRule { Reason = "other env", Environments = ["prod"] },
                new NotApplicableRule { Reason = "other tag", Tags = ["fast"] },
                new NotApplicableRule { Reason = "slow here", Tags = ["slow"], Environments = ["local"] },
            ],
        });
        Assert.Equal("slow here", Policy.SkipReason(declaration, rules));
    }
}

public class EnvelopeTests
{
    [Fact]
    public void GitHubActionsGivesTheActorAndRunUrl()
    {
        var env = new Dictionary<string, string>
        {
            ["GITHUB_ACTIONS"] = "true",
            ["GITHUB_ACTOR"] = "octo",
            ["GITHUB_SERVER_URL"] = "https://github.com",
            ["GITHUB_REPOSITORY"] = "acme/app",
            ["GITHUB_RUN_ID"] = "9",
            ["GITHUB_HEAD_REF"] = "feature",
        };
        Assert.Equal("{\"ci\":\"github-actions\",\"ciRunUrl\":\"https://github.com/acme/app/actions/runs/9\",\"name\":\"octo\"}", Compact(RunEnvelope.Actor(env)));
        Assert.Equal("{\"branch\":\"feature\",\"commit\":null,\"dirty\":true}", Compact(RunEnvelope.Source(new GitFacts("/r", "not-a-sha", null, true), env)));
        env.Remove("GITHUB_RUN_ID");
        Assert.Equal("{\"ci\":\"github-actions\",\"ciRunUrl\":null,\"name\":\"octo\"}", Compact(RunEnvelope.Actor(env)));
    }

    [Fact]
    public void OutsideCiTheUserNameIsTheActor()
    {
        Assert.Equal("{\"ci\":null,\"ciRunUrl\":null,\"name\":\"me\"}", Compact(RunEnvelope.Actor(new Dictionary<string, string> { ["USERNAME"] = "me" })));
        var sha = new string('a', 40);
        Assert.Equal($"{{\"branch\":\"main\",\"commit\":\"{sha}\",\"dirty\":false}}", Compact(RunEnvelope.Source(new GitFacts("/r", sha, "main", false), new Dictionary<string, string>())));
    }

    [Fact]
    public void TargetVariablesBecomeLowerCaseKeys() =>
        Assert.Equal(
            "{\"digest\":\"sha256:1\",\"image_tag\":null}",
            Compact(RunEnvelope.Target(new Dictionary<string, string> { ["QUALIFY_TARGET_DIGEST"] = "sha256:1", ["QUALIFY_TARGET_IMAGE_TAG"] = "", ["QUALIFY_TARGET_"] = "x", ["OTHER"] = "y" })));

    [Fact]
    public void UlidsAreReproducibleAndValid()
    {
        var id = Ulid.Create(0, new byte[10]);
        Assert.Equal("00000000000000000000000000", id);
        Assert.True(Ulid.IsValid(Ulid.New()));
        Assert.False(Ulid.IsValid("not-a-ulid"));
        Assert.Throws<ArgumentOutOfRangeException>(() => Ulid.Create(-1, new byte[10]));
        Assert.Throws<ArgumentException>(() => Ulid.Create(0, new byte[9]));
        Assert.Equal("7ZZZZZZZZZZZZZZZZZZZZZZZZZ", Ulid.Create((1L << 48) - 1, Enumerable.Repeat((byte)0xFF, 10).ToArray()));
    }

    [Fact]
    public void GitProbeReadsTheRepositoryOrNothing()
    {
        var facts = new GitProbe().Read(Repo.Root);
        Assert.NotNull(facts.Root);
        Assert.Matches("^[0-9a-f]{40}$", facts.Commit!);
        Assert.Equal(GitFacts.None, new GitProbe().Read(Path.GetTempPath()));
    }

    private static string Compact(JsonNode node) => Lekman.Qualify.Values.JsonText.Compact(node);
}

public class EvidenceFileTests
{
    [Fact]
    public void NamesAndKeys()
    {
        var key = EvidenceFiles.Key("a.cs:1");
        Assert.Matches("^[0-9a-f]{8}$", key);
        var name = EvidenceFiles.Record("01HQA1ZQJ0C0NF0RMANCE00000", "OQ-AREA-001", key);
        Assert.Equal(new EvidenceName("01HQA1ZQJ0C0NF0RMANCE00000", "OQ-AREA-001", key, false), EvidenceFiles.Parse(name));
        Assert.True(EvidenceFiles.Parse(EvidenceFiles.Marker("01HQA1ZQJ0C0NF0RMANCE00000", "OQ-AREA-001", key))!.IsMarker);
        Assert.Null(EvidenceFiles.Parse("other.json"));
        Assert.Equal($"{EvidenceFiles.Sha256("x"u8.ToArray())}  f.json\n", EvidenceFiles.Sidecar("x"u8.ToArray(), "f.json"));
    }

    [Fact]
    public void SitesAreRelativeToTheRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "repo");
        Assert.Equal("src/a.cs:3", Sites.Format(Path.Combine(root, "src", "a.cs"), 3, root));
        Assert.Equal("src/a.cs:3", Sites.Format("/_/src/a.cs", 3, root));
        Assert.Equal("rel/b.cs:0", Sites.Format("rel/b.cs", -1, root));
        Assert.Equal("c.cs:4", Sites.Format(Path.Combine(Path.GetTempPath(), "elsewhere", "c.cs"), 4, root));
        Assert.Equal("unknown:1", Sites.Format(null, 1, root));
        Assert.True(Sites.SamePath("/a/b.cs", "/a/b.cs"));
    }

    [Fact]
    public void ExceptionFramesInTheTestFileGiveTheSite()
    {
        try
        {
            throw new InvalidOperationException("x");
        }
        catch (InvalidOperationException error)
        {
            var frame = Sites.InFile(error, ThisFile());
            Assert.NotNull(frame);
            Assert.True(frame.Value.Line > 0);
            Assert.Null(Sites.InFile(error, "/nowhere.cs"));
        }
    }

    [Fact]
    public void TheWriterReplacesFilesAtomically()
    {
        var dir = Directory.CreateTempSubdirectory("qualify-writer-").FullName;
        try
        {
            var path = Path.Combine(dir, "sub", "f.json");
            var writer = new AtomicFileWriter();
            writer.Write(path, "one");
            writer.Write(path, "two");
            Assert.Equal("two", File.ReadAllText(path));
            Assert.Single(Directory.GetFiles(Path.GetDirectoryName(path)!));
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    private static string ThisFile([System.Runtime.CompilerServices.CallerFilePath] string path = "") => path;
}
