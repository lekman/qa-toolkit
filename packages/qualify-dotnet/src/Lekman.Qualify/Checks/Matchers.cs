using System.Collections;
using System.Numerics;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lekman.Qualify.Values;

namespace Lekman.Qualify.Checks;

/// <summary>What a matcher records: the expected and actual values and whether it passed.</summary>
public sealed record MatchResult(JsonNode? Expected, JsonNode? Actual, bool Pass);

/// <summary>
/// The matchers of section 3.2 of the specification, as pure functions from
/// the value under test and the matcher's argument to what the check records.
/// The names are the shared JSON names.
/// </summary>
public static class Matchers
{
    /// <summary>Deep equality after normalisation.</summary>
    public static MatchResult EqualsTo(object? actual, object? expected) =>
        new(Normaliser.Normalise(expected), Normaliser.Normalise(actual), Normaliser.Equal(actual, expected));

    /// <summary>Not deep-equal.</summary>
    public static MatchResult NotEquals(object? actual, object? expected) =>
        new(Normaliser.Normalise(expected), Normaliser.Normalise(actual), !Normaliser.Equal(actual, expected));

    /// <summary>A string contains a substring, or a list contains an equal element.</summary>
    public static MatchResult Contains(object? actual, object? expected)
    {
        var pass = actual is string text && expected is string part
            ? text.Contains(part, StringComparison.Ordinal)
            : Elements(actual).Any(item => Normaliser.Equal(item, expected));
        return new(Normaliser.Normalise(expected), Normaliser.Normalise(actual), pass);
    }

    /// <summary>A string matches a regular expression; the pattern source is recorded.</summary>
    public static MatchResult Matches(object? actual, Regex pattern) =>
        new(JsonValue.Create(pattern.ToString()), Normaliser.Normalise(actual), actual is string text && pattern.IsMatch(text));

    /// <summary>The value is boolean true.</summary>
    public static MatchResult IsTrue(object? actual) =>
        new(JsonValue.Create(true), Normaliser.Normalise(actual), actual is true);

    /// <summary>The value is boolean false.</summary>
    public static MatchResult IsFalse(object? actual) =>
        new(JsonValue.Create(false), Normaliser.Normalise(actual), actual is false);

    /// <summary>The value is null.</summary>
    public static MatchResult IsNull(object? actual) =>
        new(null, Normaliser.Normalise(actual), actual is null);

    /// <summary>The value is not null.</summary>
    public static MatchResult IsNotNull(object? actual) =>
        new(JsonValue.Create("not null"), Normaliser.Normalise(actual), actual is not null);

    /// <summary>A string, list or map has the given length; a string counts code points.</summary>
    public static MatchResult HasLength(object? actual, int length)
    {
        if (length < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(length), "HasLength takes a non-negative integer");
        }

        var measured = Normaliser.LengthOf(actual);
        return new(JsonValue.Create(length), measured is null ? null : JsonValue.Create(measured.Value), measured == length);
    }

    /// <summary>A number is at least the bound.</summary>
    public static MatchResult AtLeast(object? actual, object bound) => Bounded(actual, bound, atLeast: true);

    /// <summary>A number is at most the bound.</summary>
    public static MatchResult AtMost(object? actual, object bound) => Bounded(actual, bound, atLeast: false);

    /// <summary>The value equals one of the given values; the list is recorded.</summary>
    public static MatchResult OneOf(object? actual, IEnumerable values)
    {
        var list = values.Cast<object?>().ToList();
        return new(Normaliser.Normalise(list), Normaliser.Normalise(actual), list.Any(item => Normaliser.Equal(actual, item)));
    }

    private static MatchResult Bounded(object? actual, object bound, bool atLeast)
    {
        var limit = NumberOf(bound) ?? throw new ArgumentException($"{(atLeast ? "IsAtLeast" : "IsAtMost")} takes a number", nameof(bound));
        var value = NumberOf(actual);
        var pass = value is not null && (atLeast ? Compare(value, limit) >= 0 : Compare(value, limit) <= 0);
        return new(Normaliser.Normalise(bound), Normaliser.Normalise(actual), pass);
    }

    private static IEnumerable<object?> Elements(object? value) =>
        value is IEnumerable items and not string ? items.Cast<object?>() : [];

    /// <summary>A number as a whole part and a fraction, so integers beyond 2^53 compare exactly.</summary>
    private sealed record Number(BigInteger Whole, double Fraction, int Infinite);

    private static Number? NumberOf(object? value)
    {
        switch (value)
        {
            case sbyte or byte or short or ushort or int or uint or long:
                return new(new BigInteger(Convert.ToInt64(value, System.Globalization.CultureInfo.InvariantCulture)), 0, 0);
            case ulong big:
                return new(new BigInteger(big), 0, 0);
            case BigInteger big:
                return new(big, 0, 0);
            case Int128 big:
                return new((BigInteger)big, 0, 0);
            case UInt128 big:
                return new((BigInteger)big, 0, 0);
            case decimal dec:
                var whole = decimal.Truncate(dec);
                return new(new BigInteger(whole), (double)(dec - whole), 0);
            case float or double or Half:
                var real = Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
                if (double.IsNaN(real))
                {
                    return null;
                }

                if (double.IsInfinity(real))
                {
                    return new(BigInteger.Zero, 0, real > 0 ? 1 : -1);
                }

                var truncated = Math.Truncate(real);
                return new(new BigInteger(truncated), real - truncated, 0);
            default:
                return null;
        }
    }

    private static int Compare(Number a, Number b)
    {
        if (a.Infinite != 0 || b.Infinite != 0)
        {
            return a.Infinite.CompareTo(b.Infinite);
        }

        var whole = a.Whole.CompareTo(b.Whole);
        return whole != 0 ? whole : a.Fraction.CompareTo(b.Fraction);
    }
}
