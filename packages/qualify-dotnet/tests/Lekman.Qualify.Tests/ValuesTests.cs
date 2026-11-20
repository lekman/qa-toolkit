using System.Collections.Immutable;
using System.Numerics;
using System.Text.Json.Nodes;
using Lekman.Qualify.Values;
using Xunit;

namespace Lekman.Qualify.Tests;

public class ValuesTests
{
    [Theory]
    [InlineData(1d, "1")]
    [InlineData(-0d, "0")]
    [InlineData(0.1, "0.1")]
    [InlineData(123.45, "123.45")]
    [InlineData(100d, "100")]
    [InlineData(1e21, "1e+21")]
    [InlineData(1.5e21, "1.5e+21")]
    [InlineData(1e-7, "1e-7")]
    [InlineData(1.25e-7, "1.25e-7")]
    [InlineData(0.000001, "0.000001")]
    [InlineData(-2.5, "-2.5")]
    [InlineData(123456789012345680000d, "123456789012345680000")]
    [InlineData(double.NaN, "null")]
    [InlineData(double.PositiveInfinity, "null")]
    public void NumbersAreWrittenAsJavaScriptWritesThem(double value, string expected) =>
        Assert.Equal(expected, JsonText.Number(value));

    [Fact]
    public void IntegersHaveNoDecimalPoint()
    {
        Assert.Equal("1\n", JsonText.Document(JsonValue.Create(1.0)));
        Assert.Equal("7\n", JsonText.Document(JsonValue.Create(7)));
        Assert.Equal("2.5\n", JsonText.Document(JsonNode.Parse("2.5")));
        Assert.Equal("1\n", JsonText.Document(JsonNode.Parse("1.0")));
        Assert.Equal("3\n", JsonText.Document(JsonValue.Create(3m)));
    }

    [Fact]
    public void StringsAreEscapedAsJsonStringifyEscapesThem()
    {
        Assert.Equal("\"a\\\"b\\\\c\\n\\r\\t\\b\\f\\u0001\"", JsonText.Quote("a\"b\\c\n\r\t\b\f\u0001"));
        Assert.Equal("\"données — 入力 🚀 <>&'/\"", JsonText.Quote("données — 入力 🚀 <>&'/"));
        Assert.Equal("\"\\ud800x\"", JsonText.Quote("\ud800x"));
    }

    [Fact]
    public void DocumentsUseTwoSpacesSortedKeysAndANewline()
    {
        var value = new JsonObject { ["b"] = 1, ["a"] = new JsonArray(1, "x"), ["c"] = new JsonObject(), ["d"] = new JsonArray(), ["e"] = null, ["f"] = true, ["g"] = false };
        Assert.Equal(
            "{\n  \"a\": [\n    1,\n    \"x\"\n  ],\n  \"b\": 1,\n  \"c\": {},\n  \"d\": [],\n  \"e\": null,\n  \"f\": true,\n  \"g\": false\n}\n",
            JsonText.Document(value));
    }

    [Fact]
    public void ShapesOrderKnownKeysFirstAndSortTheRest()
    {
        var shape = JsonShape.Ordered(["z", "a"], new Dictionary<string, JsonShape> { ["z"] = JsonShape.ArrayOf(JsonShape.Ordered(["y", "x"])) });
        var value = new JsonObject { ["m"] = 1, ["a"] = 2, ["z"] = new JsonArray(new JsonObject { ["x"] = 1, ["y"] = 2 }), ["b"] = 3 };
        Assert.Equal(["z", "a", "b", "m"], JsonText.KeyOrder(value, shape));
        Assert.Contains("\"y\": 2,\n      \"x\": 1", JsonText.Document(value, shape), StringComparison.Ordinal);
    }

    [Fact]
    public void KeysSortByCodePointNotByUtf16()
    {
        // U+FF01 is above every surrogate in UTF-16, below an emoji in code points.
        var keys = new List<string> { "😀", "\uFF01", "a", "Z" };
        keys.Sort(CodePointComparer.Instance);
        Assert.Equal(["Z", "a", "\uFF01", "😀"], keys);
        Assert.True(string.CompareOrdinal("😀", "\uFF01") < 0);
        Assert.Equal(0, CodePointComparer.Instance.Compare(null, null));
        Assert.True(CodePointComparer.Instance.Compare(null, "a") < 0);
        Assert.True(CodePointComparer.Instance.Compare("a", null) > 0);
        Assert.True(CodePointComparer.Instance.Compare("ab", "a") > 0);
    }

    [Fact]
    public void ScenarioValuesNormaliseAsTheSpecificationSays()
    {
        var cycle = new List<object>();
        cycle.Add(cycle);
        Assert.Equal("{\"$bytes\":\"AQI=\"}", Key(new byte[] { 1, 2 }));
        Assert.Equal("\"2026-01-02T03:04:05.006Z\"", Key(new DateTimeOffset(2026, 1, 2, 3, 4, 5, 6, TimeSpan.Zero)));
        Assert.Equal("\"1152921504606846976\"", Key(BigInteger.Pow(2, 60)));
        Assert.Equal("\"1152921504606846976\"", Key(1L << 60));
        Assert.Equal("\"NaN\"", Key(double.NaN));
        Assert.Equal("\"Infinity\"", Key(double.PositiveInfinity));
        Assert.Equal("\"-Infinity\"", Key(float.NegativeInfinity));
        Assert.Equal("{\"a\":{\"c\":3,\"d\":2},\"b\":1}", Key(new Dictionary<string, object> { ["b"] = 1, ["a"] = new Dictionary<string, object> { ["d"] = 2, ["c"] = 3 } }));
        Assert.Equal("[\"a\",\"b\"]", Key(new HashSet<string> { "b", "a" }));
        Assert.Equal("\"[unserialisable: List<Object>]\"", Key(cycle));
    }

    [Fact]
    public void OtherValuesNormalise()
    {
        Assert.Equal("null", Key(null));
        Assert.Equal("true", Key(true));
        Assert.Equal("\"x\"", Key('x'));
        Assert.Equal("\"y\"", Key(new System.Text.Rune('y')));
        Assert.Equal("[1,2,3]", Key(new SortedSet<int> { 3, 1, 2 }));
        Assert.Equal("[\"a\",1]", Key(new HashSet<object> { "a", 1 }));
        Assert.Equal("[1,\"a\"]", Key((1, "a")));
        Assert.Equal("{\"1\":\"a\"}", Key(new Dictionary<int, string> { [1] = "a" }));
        Assert.Equal("{\"k\":1}", Key(ImmutableDictionary<string, int>.Empty.Add("k", 1)));
        Assert.Equal("[1,2]", Key(new[] { 1, 2 }));
        Assert.Equal("{\"Name\":\"x\",\"Size\":2}", Key(new { Name = "x", Size = 2 }));
        Assert.Equal("{\"Field\":1}", Key(new WithField()));
        Assert.Equal("\"[unserialisable: Probe]\"", Key(new Probe()));
        Assert.Equal("\"[unserialisable: InvalidOperationException]\"", Key(new InvalidOperationException()));
        Assert.Equal("\"Read\"", Key(Scope.Read));
        Assert.Equal("\"00:00:01\"", Key(TimeSpan.FromSeconds(1)));
        Assert.Equal("\"2026-01-02T00:00:00.000Z\"", Key(new DateOnly(2026, 1, 2)));
        Assert.Equal("\"2026-01-02T03:04:05.000Z\"", Key(new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Unspecified)));
        Assert.Equal("\"2026-01-02T03:04:05.000Z\"", Key(new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc)));
        Assert.Equal("\"abc\"", Key(new System.Text.RegularExpressions.Regex("abc")));
        Assert.Equal("{\"$bytes\":\"AQ==\"}", Key(new ReadOnlyMemory<byte>([1])));
        Assert.Equal("{\"$bytes\":\"AQ==\"}", Key(new Memory<byte>([1])));
        Assert.Equal("{\"$bytes\":\"AQ==\"}", Key(new ArraySegment<byte>([1])));
        Assert.Equal("2.5", Key(2.5m));
        Assert.Equal("4", Key(4m));
        Assert.Equal("1.5", Key((Half)1.5));
        Assert.Equal("5", Key(5u));
        Assert.Equal("\"18446744073709551615\"", Key(ulong.MaxValue));
        Assert.Equal("\"170141183460469231731687303715884105727\"", Key(Int128.MaxValue));
        Assert.Equal("9", Key((UInt128)9));
        Assert.Equal("\"9007199254740993\"", Key(9007199254740993L));
        Assert.Equal("9007199254740992", Key(9007199254740992L));
        Assert.Equal("{\"a\":[1,2.5,\"x\",true,null]}", Key(JsonNode.Parse("{\"a\":[1,2.5,\"x\",true,null]}")));
        Assert.Equal("{\"a\":1}", Key(System.Text.Json.JsonElement.Parse("{\"a\":1.0}")));
        Assert.Equal("\"12345678901234567168\"", Key(JsonNode.Parse("12345678901234567890")));
        Assert.Equal("\"[unserialisable: Func<Int32>]\"", Key(new Func<int>(() => 1)));
        Assert.Equal("\"[unserialisable: ValueTask]\"", Key(ValueTask.CompletedTask));
    }

    [Fact]
    public void EqualityIsAfterNormalisation()
    {
        Assert.True(Normaliser.Equal(1, 1.0));
        Assert.True(Normaliser.Equal(double.NaN, double.NaN));
        Assert.True(Normaliser.Equal(new[] { 1, 2 }, new List<long> { 1, 2 }));
        Assert.False(Normaliser.Equal("1", 1));
    }

    [Fact]
    public void LengthsCountCodePointsAndElements()
    {
        Assert.Equal(2, Normaliser.LengthOf("a🚀"));
        Assert.Equal(3, Normaliser.LengthOf(new[] { 1, 2, 3 }));
        Assert.Equal(1, Normaliser.LengthOf(new Dictionary<string, int> { ["a"] = 1 }));
        Assert.Equal(2, Normaliser.LengthOf(new byte[] { 1, 2 }));
        Assert.Equal(1, Normaliser.LengthOf(new ReadOnlyMemory<byte>([1])));
        Assert.Equal(1, Normaliser.LengthOf(new Memory<byte>([1])));
        Assert.Equal(2, Normaliser.LengthOf(new JsonArray(1, 2)));
        Assert.Equal(1, Normaliser.LengthOf(new JsonObject { ["a"] = 1 }));
        Assert.Equal(2, Normaliser.LengthOf(ImmutableHashSet.Create(1, 2)));
        Assert.Equal(3, Normaliser.LengthOf(Enumerable.Range(0, 3)));
        Assert.Null(Normaliser.LengthOf(5));
        Assert.Null(Normaliser.LengthOf(null));
    }

    [Fact]
    public void SortsNumbersStringsAndMixedValues()
    {
        Assert.Equal("[1,2.5,3]", JsonText.Compact(new JsonArray([.. Normaliser.Sort([JsonValue.Create(3), JsonNode.Parse("2.5"), JsonValue.Create(1)])])));
        Assert.Equal("[\"a\",\"b\"]", JsonText.Compact(new JsonArray([.. Normaliser.Sort([JsonValue.Create("b"), JsonValue.Create("a")])])));
    }

    private static string Key(object? value) => Normaliser.Key(Normaliser.Normalise(value));

    private sealed class WithField
    {
#pragma warning disable CA1051 // A public field is what this test normalises.
        public int Field = 1;
#pragma warning restore CA1051
    }

    private sealed class Probe
    {
        private readonly string reason = "no";

        public int Fails => throw new InvalidOperationException(reason);
    }
}
