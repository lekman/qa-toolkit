using System.Collections;
using System.Text.RegularExpressions;
using Lekman.Qualify.Checks;

namespace Lekman.Qualify;

/// <summary>A check that has a context and a description, waiting for the value under test.</summary>
public sealed class CheckBuilder
{
    private readonly QualifyContext owner;
    private readonly string context;
    private readonly string description;
    private readonly string site;
    private readonly bool soft;

    internal CheckBuilder(QualifyContext owner, string context, string description, string site, bool soft)
    {
        this.owner = owner;
        this.context = context;
        this.description = description;
        this.site = site;
        this.soft = soft;
    }

    /// <summary>Make the check soft: a failure is recorded and the test continues, then fails at the end.</summary>
    /// <returns>The soft check.</returns>
    public CheckBuilder Soft() => new(owner, context, description, site, soft: true);

    /// <summary>Give the value under test.</summary>
    /// <param name="actual">The value under test.</param>
    /// <returns>The matchers.</returns>
    public Assertion That(object? actual) => new(this, actual);

    internal bool Run(string matcher, MatchResult result) => owner.Record(context, description, site, soft, matcher, result);
}

/// <summary>
/// The matchers of a check. Each records the check and returns whether it
/// passed; a failed hard check throws <see cref="CheckFailedException"/>. The JSON
/// records the shared matcher names (<c>equals</c>, <c>atLeast</c>, ...).
/// </summary>
public sealed class Assertion
{
    private readonly CheckBuilder check;
    private readonly object? actual;

    internal Assertion(CheckBuilder check, object? actual)
    {
        this.check = check;
        this.actual = actual;
    }

    /// <summary>Deep equality after normalisation. Records <c>equals</c>.</summary>
    /// <param name="expected">The expected value.</param>
    /// <returns>Whether the check passed.</returns>
    public bool IsEqualTo(object? expected) => check.Run("equals", Matchers.EqualsTo(actual, expected));

    /// <summary>Not deep-equal. Records <c>notEquals</c>.</summary>
    /// <param name="unexpected">The value it must not be.</param>
    /// <returns>Whether the check passed.</returns>
    public bool IsNotEqualTo(object? unexpected) => check.Run("notEquals", Matchers.NotEquals(actual, unexpected));

    /// <summary>A string contains a substring, or a list contains an equal element. Records <c>contains</c>.</summary>
    /// <param name="expected">The substring or element.</param>
    /// <returns>Whether the check passed.</returns>
    public bool Contains(object? expected) => check.Run("contains", Matchers.Contains(actual, expected));

    /// <summary>A string matches a .NET regular expression. Records <c>matches</c> with the pattern source.</summary>
    /// <param name="pattern">The pattern.</param>
    /// <returns>Whether the check passed.</returns>
    public bool Matches(string pattern) => Matches(new Regex(pattern, RegexOptions.None, TimeSpan.FromSeconds(10)));

    /// <summary>A string matches a regular expression. Records <c>matches</c> with the pattern source.</summary>
    /// <param name="pattern">The pattern.</param>
    /// <returns>Whether the check passed.</returns>
    public bool Matches(Regex pattern)
    {
        ArgumentNullException.ThrowIfNull(pattern);
        return check.Run("matches", Matchers.Matches(actual, pattern));
    }

    /// <summary>The value is boolean true. Records <c>isTrue</c>.</summary>
    /// <returns>Whether the check passed.</returns>
    public bool IsTrue() => check.Run("isTrue", Matchers.IsTrue(actual));

    /// <summary>The value is boolean false. Records <c>isFalse</c>.</summary>
    /// <returns>Whether the check passed.</returns>
    public bool IsFalse() => check.Run("isFalse", Matchers.IsFalse(actual));

    /// <summary>The value is null. Records <c>isNull</c>.</summary>
    /// <returns>Whether the check passed.</returns>
    public bool IsNull() => check.Run("isNull", Matchers.IsNull(actual));

    /// <summary>The value is not null. Records <c>isNotNull</c>.</summary>
    /// <returns>Whether the check passed.</returns>
    public bool IsNotNull() => check.Run("isNotNull", Matchers.IsNotNull(actual));

    /// <summary>A string, list or map has the given length. A string counts Unicode code points. Records <c>hasLength</c>.</summary>
    /// <param name="length">The length, not negative.</param>
    /// <returns>Whether the check passed.</returns>
    public bool HasLength(int length) => check.Run("hasLength", Matchers.HasLength(actual, length));

    /// <summary>A number is at least the bound. Records <c>atLeast</c>.</summary>
    /// <param name="bound">The bound.</param>
    /// <returns>Whether the check passed.</returns>
    public bool IsAtLeast(object bound) => check.Run("atLeast", Matchers.AtLeast(actual, bound));

    /// <summary>A number is at most the bound. Records <c>atMost</c>.</summary>
    /// <param name="bound">The bound.</param>
    /// <returns>Whether the check passed.</returns>
    public bool IsAtMost(object bound) => check.Run("atMost", Matchers.AtMost(actual, bound));

    /// <summary>The value equals one of the given values. Records <c>oneOf</c> with the list.</summary>
    /// <param name="values">The allowed values.</param>
    /// <returns>Whether the check passed.</returns>
    public bool IsOneOf(IEnumerable values)
    {
        ArgumentNullException.ThrowIfNull(values);
        return check.Run("oneOf", Matchers.OneOf(actual, values));
    }

    /// <summary>The value equals one of the given values. Records <c>oneOf</c> with the list.</summary>
    /// <param name="values">The allowed values.</param>
    /// <returns>Whether the check passed.</returns>
    public bool IsOneOf(params object?[] values) => IsOneOf((IEnumerable)values);
}
