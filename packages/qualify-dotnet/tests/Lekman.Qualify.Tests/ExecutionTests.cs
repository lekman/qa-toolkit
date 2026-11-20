using System.Numerics;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lekman.Qualify.Checks;
using Lekman.Qualify.Declarations;
using Lekman.Qualify.Envelope;
using Lekman.Qualify.Execution;
using Lekman.Qualify.Settings;
using Lekman.Qualify.Values;
using Xunit;

namespace Lekman.Qualify.Tests;

public class MatcherTests
{
    [Fact]
    public void MatchersRecordTheSharedValues()
    {
        Assert.True(Matchers.EqualsTo(1, 1.0).Pass);
        Assert.False(Matchers.NotEquals(1, 1).Pass);
        Assert.True(Matchers.Contains("qualify", "ali").Pass);
        Assert.True(Matchers.Contains(new[] { 1, 2 }, 2L).Pass);
        Assert.False(Matchers.Contains(5, 5).Pass);
        var matches = Matchers.Matches("abc", new Regex("^a"));
        Assert.True(matches.Pass);
        Assert.Equal("\"^a\"", JsonText.Compact(matches.Expected));
        Assert.False(Matchers.Matches(5, new Regex("5")).Pass);
        Assert.True(Matchers.IsTrue(true).Pass);
        Assert.False(Matchers.IsTrue("true").Pass);
        Assert.True(Matchers.IsFalse(false).Pass);
        Assert.True(Matchers.IsNull(null).Pass);
        Assert.Equal("\"not null\"", JsonText.Compact(Matchers.IsNotNull(1).Expected));
        var length = Matchers.HasLength("a🚀", 2);
        Assert.True(length.Pass);
        Assert.Equal("2", JsonText.Compact(length.Actual));
        Assert.Null(Matchers.HasLength(5, 1).Actual);
        Assert.Throws<ArgumentOutOfRangeException>(() => Matchers.HasLength("a", -1));
        Assert.True(Matchers.OneOf("b", new[] { "a", "b" }).Pass);
        Assert.Equal("[\"a\",\"b\"]", JsonText.Compact(Matchers.OneOf("c", new[] { "a", "b" }).Expected));
    }

    [Fact]
    public void BoundsCompareNumbersExactly()
    {
        Assert.True(Matchers.AtLeast(5, 5).Pass);
        Assert.False(Matchers.AtLeast(4.5, 5).Pass);
        Assert.True(Matchers.AtMost(-1.5, -1).Pass);
        Assert.True(Matchers.AtLeast(BigInteger.Pow(2, 60) + 1, 1L << 60).Pass);
        Assert.True(Matchers.AtLeast(double.PositiveInfinity, ulong.MaxValue).Pass);
        Assert.False(Matchers.AtMost(double.PositiveInfinity, 1).Pass);
        Assert.True(Matchers.AtMost(2.25m, 2.5f).Pass);
        Assert.True(Matchers.AtLeast(Int128.MaxValue, (UInt128)1).Pass);
        Assert.True(Matchers.AtLeast((Half)2, (short)1).Pass);
        Assert.False(Matchers.AtLeast(double.NaN, 1).Pass);
        Assert.False(Matchers.AtLeast("5", 1).Pass);
        Assert.Throws<ArgumentException>(() => Matchers.AtLeast(1, "x"));
    }
}

public class ContextTests
{
    [Fact]
    public void ChecksRecordInCallOrderAndHardFailuresThrow()
    {
        var ctx = Context();
        Assert.True(ctx.Check("c", "d").That(1).IsEqualTo(1));
        Assert.False(ctx.Check("c", "soft").Soft().That(1).IsEqualTo(2));
        var failure = Assert.Throws<CheckFailedException>(() => ctx.Check("c", "hard").That(1).IsNotEqualTo(1));
        Assert.Equal("c: hard", failure.Message);
        Assert.Matches(@"ExecutionTests\.cs:\d+$", failure.Site);
        ctx.Check("c", "m").That("abc").Matches("b");
        ctx.Check("c", "r").That("abc").Matches(new Regex("c$"));
        ctx.Check("c", "t").That(true).IsTrue();
        ctx.Check("c", "f").That(false).IsFalse();
        ctx.Check("c", "n").That(null).IsNull();
        ctx.Check("c", "nn").That(1).IsNotNull();
        ctx.Check("c", "l").That("ab").HasLength(2);
        ctx.Check("c", "lo").That(3).IsAtLeast(1);
        ctx.Check("c", "hi").That(3).IsAtMost(4);
        ctx.Check("c", "o").That(3).IsOneOf(1, 2, 3);
        ctx.Check("c", "oe").That(3).IsOneOf(new List<int> { 3 });
        ctx.Check("c", "has").That(new[] { 1 }).Contains(1);
        var checks = ctx.Checks();
        Assert.Equal(Enumerable.Range(0, checks.Count), checks.Select(c => c.Seq));
        Assert.Single(ctx.SoftFailures());
        Assert.Equal("ctx", ctx.Environment);
        Assert.Equal("OQ-CTX-001", ctx.Id);
        Assert.Equal("OQ", ctx.Level);
    }

    [Fact]
    public void ArgumentsAreChecked()
    {
        var ctx = Context();
        Assert.Throws<ArgumentException>(() => ctx.Check("", "d"));
        Assert.Throws<ArgumentException>(() => ctx.Check("c", ""));
        Assert.Throws<ArgumentException>(() => ctx.Secret("bad name"));
        Assert.Throws<SecretNotFoundException>(() => ctx.Secret("MISSING"));
        Assert.Throws<ArgumentException>(() => ctx.Attach("a/b", "x", "text/plain"));
        Assert.Throws<ArgumentException>(() => ctx.Attach("a", new { A = 1 }, "text/plain"));
        Assert.Throws<ArgumentException>(() => ctx.Skip(""));
        Assert.Throws<ArgumentNullException>(() => ctx.Check("c", "d").That(1).IsOneOf((System.Collections.IEnumerable)null!));
        Assert.Throws<ArgumentNullException>(() => ctx.Check("c", "d").That("a").Matches((Regex)null!));
    }

    [Fact]
    public void SecretsAreRegisteredAndShortValuesRefused()
    {
        var warnings = new List<string>();
        var registry = new SecretRegistry();
        var ctx = Context(registry, warnings, name => name == "TOKEN" ? "s3cr3t-token" : null);
        Assert.Equal("s3cr3t-token", ctx.Secret("TOKEN"));
        Assert.Equal("abc", ctx.Redact("abc"));
        Assert.Single(warnings);
        Assert.Equal(["s3cr3t-token"], registry.Values());
        Assert.Equal(["TOKEN"], ctx.SecretsUsed());
    }

    [Fact]
    public void AttachmentsKeepBytesOrJsonAndRespectTheLimit()
    {
        var ctx = Context(limit: 200);
        ctx.Attach("a.txt", "hello", "text/plain");
        ctx.Attach("b.bin", new byte[] { 1 }, "application/octet-stream");
        ctx.Attach("c.json", "{\"b\":1,\"a\":2}", "application/json; charset=utf-8");
        ctx.Attach("d.json", "not json", "application/json");
        ctx.Attach("e.json", new Dictionary<string, int> { ["k"] = 1 });
        ctx.RunContext(new Dictionary<string, object?> { ["extra"] = 1 });
        var attached = ctx.Attachments();
        Assert.Equal(6, attached.Count);
        Assert.True(attached[2].IsJson);
        Assert.False(attached[3].IsJson);
        Assert.Equal("{\"actor\":{},\"extra\":{\"extra\":1},\"source\":{},\"target\":{}}", JsonText.Compact(attached[5].Json));
        var error = Assert.Throws<AttachmentTooLargeException>(() => ctx.Attach("big.txt", new string('a', 201), "text/plain"));
        Assert.Equal("attachment big.txt is 201 bytes, over the limit of 200 bytes", error.Message);
    }

    [Fact]
    public async Task DelegatesRecordOneCheckAndKeepTheFailure()
    {
        var ctx = Context();
        ctx.Delegate("h", "action", () => { });
        Assert.Equal(3, ctx.Delegate("h", "function", () => 3));
        await ctx.DelegateAsync("h", "async", () => Task.CompletedTask);
        Assert.Equal(4, await ctx.DelegateAsync("h", "async value", () => Task.FromResult(4)));
        Assert.Throws<InvalidOperationException>(() => ctx.Delegate("h", "fails", () => throw new InvalidOperationException("bad")));
        var pending = ctx.DelegateAsync("h", "late", async () =>
        {
            await Task.Yield();
            throw new FormatException("later");
        });
        Assert.IsType<FormatException>(await ctx.Settle());
        await Assert.ThrowsAsync<FormatException>(() => pending);
        var checks = ctx.Checks();
        Assert.All(checks, c => Assert.Equal("delegate", c.Matcher));
        Assert.Equal("bad", JsonText.Compact(checks[4].Actual).Trim('"'));
        Assert.Contains("ContextTests", checks[0].Delegate, StringComparison.Ordinal);
        Assert.Throws<ArgumentNullException>(() => ctx.Delegate("h", "d", (Action)null!));
    }

    [Fact]
    public void SkipThrowsTheDynamicSkip()
    {
        var error = Thrown.Of<SkipException>(() => Context().Skip("not seeded"));
        Assert.Equal("not seeded", error.Reason);
        Assert.StartsWith("$XunitDynamicSkip$", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void CurrentIsSetOnlyInsideATest()
    {
        Assert.Throws<InvalidOperationException>(() => QualifyContext.Current);
        var ctx = Context();
        using (QualifyContext.Enter(ctx))
        {
            Assert.Same(ctx, QualifyContext.Current);
        }

        Assert.Throws<InvalidOperationException>(() => QualifyContext.Current);
    }

    internal static QualifyContext Context(SecretRegistry? registry = null, List<string>? warnings = null, Func<string, string?>? secrets = null, long limit = 1024) =>
        new(new ContextSettings
        {
            Id = "OQ-CTX-001",
            Level = "OQ",
            Environment = "ctx",
            AttachmentLimit = limit,
            ReadSecret = secrets ?? (_ => null),
            Registry = registry ?? new SecretRegistry(),
            RunContext = () => (new JsonObject(), new JsonObject(), new JsonObject()),
            Site = (file, line) => $"{Path.GetFileName(file)}:{line}",
            Now = () => DateTimeOffset.UnixEpoch,
            Warn = message => warnings?.Add(message),
        });
}

public class OutcomeTests
{
    [Fact]
    public void OutcomesFollowSection33()
    {
        Assert.Equal("pass", Outcomes.Classify(null, 0).Outcome);
        Assert.Equal(new Classification("fail", null, "CheckFailed", "2 soft check(s) failed"), Outcomes.Classify(null, 2));
        Assert.Equal("fixture not seeded", Outcomes.Classify(new SkipException("fixture not seeded"), 0).SkipReason);
        Assert.Equal("dyn", Outcomes.Classify(new InvalidOperationException("$XunitDynamicSkip$dyn"), 0).SkipReason);
        Assert.Equal(new Classification("fail", null, "CheckFailed", "c: d"), Outcomes.Classify(new CheckFailedException("c: d", "f:1"), 0));
        Assert.Equal(new Classification("fail", null, "FailException", "nope"), Outcomes.Classify(Xunit.Sdk.FailException.ForFailure("nope"), 0));
        Assert.Equal("error", Outcomes.Classify(new InvalidOperationException("boom"), 1).Outcome);
        Assert.Equal("AttachmentTooLarge", Outcomes.TypeName(new AttachmentTooLargeException("x")));
        Assert.Equal("SecretNotFound", Outcomes.TypeName(new SecretNotFoundException("x")));
        Assert.Equal("FormatException", Outcomes.TypeName(new RedactedException("FormatException", "m", null)));
        Assert.True(Outcomes.IsAssertion(new RedactedAssertion("X", "m", null)));
        Assert.True(Outcomes.IsAssertion(Xunit.Sdk.TraceAssertException.ForAssertFailure("m", "d")));
    }
}

public class TestExecutionTests
{
    private static readonly Declaration Declared = DeclarationRules.Validate(
        new DeclarationInput { Level = "OQ", Id = "OQ-EXEC-001", Title = "t", Given = "g", When = "w", Then = "t", Scope = Scope.ReadWrite },
        "tests/ExecutionTests.cs:1");

    [Fact]
    public async Task APassingBodyWritesAMarkerAndARecord()
    {
        var (process, files) = Process();
        await TestExecution.Run(Declared, ThisFile(), () => Ctx().Check("c", "d").That(1).IsEqualTo(1), process);
        var record = Record(files);
        Assert.Equal("pass", (string?)record["test"]!["outcome"]);
        Assert.Equal(2, files.Files.Count);
        Assert.Equal(10L, (long)record["test"]!["durationMs"]!);
        Assert.EndsWith("\n", files.Files.Values.First().Length > 0 ? Encoding.UTF8.GetString(files.Files.Values.First()) : "", StringComparison.Ordinal);
    }

    [Fact]
    public async Task FailuresAreRecordedAndRethrown()
    {
        var (process, files) = Process();
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => TestExecution.Run(Declared, ThisFile(), () => throw new InvalidOperationException("boom"), process));
        Assert.Equal("boom", error.Message);
        var failure = Record(files)["test"]!["error"]!;
        Assert.Equal("InvalidOperationException", (string?)failure["type"]);
        Assert.Matches(@":\d+$", (string)failure["site"]!);
    }

    [Fact]
    public async Task AsyncBodiesAreAwaited()
    {
        var (process, files) = Process();
        await Assert.ThrowsAsync<FormatException>(() => TestExecution.Run(Declared, null, () => FailLater(), process));
        Assert.Null(Record(files)["test"]!["error"]!["site"]);
        await TestExecution.Run(Declared, null, () => new ValueTask<int>(1), process);
        await TestExecution.Run(Declared, null, () => ValueTask.CompletedTask, process);
        Assert.Equal("pass", (string?)Record(files)["test"]!["outcome"]);
    }

    [Fact]
    public async Task SoftFailuresFailTheTestAtTheEnd()
    {
        var (process, files) = Process();
        var error = await Assert.ThrowsAsync<CheckFailedException>(() => TestExecution.Run(Declared, ThisFile(), () => Ctx().Check("c", "d").Soft().That(1).IsEqualTo(2), process));
        Assert.Equal("1 soft check(s) failed", error.Message);
        Assert.Equal("1 soft check(s) failed", (string?)Record(files)["test"]!["error"]!["message"]);
    }

    [Fact]
    public async Task SkipsAreRecordedAndReportedToXunit()
    {
        var (process, files) = Process();
        await Thrown.OfAsync<SkipException>(() => TestExecution.Run(Declared, null, () => { Ctx().Skip("later"); return null; }, process));
        Assert.Equal("later", (string?)Record(files)["test"]!["skipReason"]);
        var dynamic = await Thrown.OfAsync<Xunit.Sdk.SkipException>(() => TestExecution.Run(Declared, null, () => throw Xunit.Sdk.SkipException.ForSkip("xunit skip"), process));
        Assert.Equal("xunit skip", (string?)Record(files)["test"]!["skipReason"]);
        Assert.NotNull(dynamic);
    }

    [Fact]
    public async Task ThePolicySkipsWritesInProductionWithoutRunningTheBody()
    {
        var (process, files) = Process(("QUALIFY_ENVIRONMENT", "production"));
        var ran = false;
        await Thrown.OfAsync<SkipException>(() => TestExecution.Run(Declared, null, () => ran = true, process));
        Assert.False(ran);
        Assert.Equal("read-write test blocked in production environment production", (string?)Record(files)["test"]!["skipReason"]);
        Assert.Empty((JsonArray)Record(files)["test"]!["checks"]!);
    }

    [Fact]
    public async Task SecretsNeverReachTheEvidenceOrTheRunner()
    {
        var (process, files) = Process(("QUALIFY_SECRET_T", "s3cr3t-value-123"));
        var error = await Assert.ThrowsAnyAsync<Exception>(() => TestExecution.Run(Declared, ThisFile(), () =>
        {
            var ctx = Ctx();
            var t = ctx.Secret("T");
            ctx.Attach("a.json", new Dictionary<string, string> { ["token"] = t, ["note"] = "x " + t }, "application/json");
            ctx.Attach("a.bin", Encoding.UTF8.GetBytes(t), "application/octet-stream");
            throw new InvalidOperationException("failed with " + t);
        }, process));
        Assert.Equal("failed with [REDACTED]", error.Message);
        Assert.Equal("InvalidOperationException", Outcomes.TypeName(error));
        Assert.DoesNotContain("s3cr3t-value-123", error.ToString(), StringComparison.Ordinal);
        foreach (var bytes in files.Files.Values)
        {
            Assert.DoesNotContain("s3cr3t-value-123", Encoding.UTF8.GetString(bytes), StringComparison.Ordinal);
        }

        var assertion = await Assert.ThrowsAnyAsync<Exception>(() => TestExecution.Run(Declared, null, () =>
        {
            var t = Ctx().Secret("T");
            throw Xunit.Sdk.FailException.ForFailure("saw " + t);
        }, process));
        Assert.True(Outcomes.IsAssertion(assertion));
        Assert.Equal("saw [REDACTED]", assertion.Message);
    }

    private static QualifyContext Ctx() => QualifyContext.Current;

    private static async Task FailLater()
    {
        await Task.Yield();
        throw new FormatException("later");
    }

    private static (ProcessContext Process, MemoryWriter Files) Process(params (string Key, string Value)[] env)
    {
        var runtime = new MemoryRuntime();
        foreach (var (key, value) in env)
        {
            runtime.Variables[key] = value;
        }

        var settings = SettingsResolver.Resolve(runtime.Variables);
        var envelope = RunEnvelope.Build("01HQA1ZQJ0C0NF0RMANCE00000", settings.Environment, new ToolInfo("t", "1", "csharp", "r"), GitFacts.None, runtime.Variables, settings.ProductionWriteBlocked, settings.Overrides);
        return (new ProcessContext { Envelope = envelope, EvidenceDir = "/ev", Settings = settings, SiteRoot = "/", Dependencies = runtime }, runtime.Files);
    }

    private static JsonObject Record(MemoryWriter files) =>
        (JsonObject)JsonNode.Parse(files.Files.Single(f => f.Key.EndsWith(".json", StringComparison.Ordinal)).Value)!;

    private static string ThisFile([System.Runtime.CompilerServices.CallerFilePath] string path = "") => path;
}

[Collection(SelfQualification.Collection)]
public class RuntimeTests
{
    [Fact]
    public void TheRuntimeBuildsOneContextPerProcess()
    {
        var runtime = new MemoryRuntime { Git = new FixedGit(new GitFacts("/repo", null, null, null)) };
        runtime.Variables["QUALIFY_ATTACHMENT_LIMIT"] = "bad";
        QualifyRuntime.UseDependencies(runtime);
        try
        {
            Assert.Throws<ConfigurationException>(QualifyRuntime.Process);
            Assert.Throws<ConfigurationException>(QualifyRuntime.Process);
            runtime.Variables.Remove("QUALIFY_ATTACHMENT_LIMIT");
            runtime.Variables["QUALIFY_RUN_ID"] = "bad";
            Qualification.Configure(new QualifyOptions());
            Assert.Contains("not a ULID", Assert.Throws<ConfigurationException>(QualifyRuntime.Process).Message, StringComparison.Ordinal);
            runtime.Variables.Remove("QUALIFY_RUN_ID");
            Qualification.Configure(new QualifyOptions { EvidenceDir = "ev" });
            var first = QualifyRuntime.Process();
            Assert.Same(first, QualifyRuntime.Process());
            Assert.Equal(Path.GetFullPath("ev", "/work"), first.EvidenceDir);
            Assert.Equal("/repo", first.SiteRoot);
            Assert.Equal("/repo", QualifyRuntime.SiteRoot());
            Assert.Equal("csharp", (string?)first.Envelope["tool"]!["language"]);
            Assert.Contains("xunit.v3", QualifyRuntime.RuntimeDescription, StringComparison.Ordinal);
            Assert.Equal("0.1.0", QualifyRuntime.ToolVersion);
        }
        finally
        {
            Qualification.Configure(SelfQualification.Options);
            QualifyRuntime.UseDependencies(SystemRuntime.Instance);
        }
    }
}

/// <summary>
/// Catches an expected exception. xUnit's Assert.Throws lets a dynamic skip
/// exception escape on purpose, which would skip the test instead of checking it.
/// </summary>
internal static class Thrown
{
    public static T Of<T>(Action action)
        where T : Exception
    {
        try
        {
            action();
        }
        catch (T error)
        {
            return error;
        }

        throw new Xunit.Sdk.XunitException($"no {typeof(T).Name} was thrown");
    }

    public static async Task<T> OfAsync<T>(Func<Task> action)
        where T : Exception
    {
        try
        {
            await action();
        }
        catch (T error)
        {
            return error;
        }

        throw new Xunit.Sdk.XunitException($"no {typeof(T).Name} was thrown");
    }
}
