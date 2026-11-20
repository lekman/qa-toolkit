namespace Lekman.Qualify.Values;

/// <summary>
/// Orders strings by Unicode code point, the order every qualify implementation
/// can reproduce. <see cref="StringComparer.Ordinal"/> compares UTF-16 code
/// units, which puts a character outside the Basic Multilingual Plane (a
/// surrogate pair, 0xD800 to 0xDFFF) before U+E000 to U+FFFF. Code point order
/// puts it after them.
/// </summary>
public sealed class CodePointComparer : IComparer<string>
{
    /// <summary>The shared instance.</summary>
    public static CodePointComparer Instance { get; } = new();

    private CodePointComparer()
    {
    }

    /// <inheritdoc />
    public int Compare(string? x, string? y)
    {
        if (ReferenceEquals(x, y))
        {
            return 0;
        }

        if (x is null)
        {
            return -1;
        }

        if (y is null)
        {
            return 1;
        }

        var length = Math.Min(x.Length, y.Length);
        for (var i = 0; i < length; i++)
        {
            var a = x[i];
            var b = y[i];
            if (a == b)
            {
                continue;
            }

            // Code units below 0xD800 order the same as code points. From
            // there, a surrogate stands for a code point above every other
            // code unit, so it sorts last.
            var surrogateA = char.IsSurrogate(a);
            var surrogateB = char.IsSurrogate(b);
            if (surrogateA != surrogateB && a >= 0xD800 && b >= 0xD800)
            {
                return surrogateA ? 1 : -1;
            }

            return a < b ? -1 : 1;
        }

        return x.Length.CompareTo(y.Length);
    }
}
