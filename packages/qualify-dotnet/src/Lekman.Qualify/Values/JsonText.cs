using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Lekman.Qualify.Values;

/// <summary>
/// Writes JSON the way every evidence file is written: UTF-8, two-space
/// indent, keys in the order a shape gives (schema order for the envelope) and
/// sorted by code point everywhere else, integers without a decimal point, and
/// a trailing newline. Strings are escaped the way the TypeScript reference
/// escapes them: quote, backslash and control characters only, so text outside
/// ASCII is written as it is.
/// </summary>
public static class JsonText
{
    private const double SafeInteger = 9007199254740992d;

    /// <summary>A JSON document: the value, written with the shape, and a newline.</summary>
    public static string Document(JsonNode? value, JsonShape? shape = null)
    {
        var builder = new StringBuilder();
        Write(builder, value, shape ?? JsonShape.Value, 0);
        builder.Append('\n');
        return builder.ToString();
    }

    /// <summary>A compact form of a value with sorted keys and no spaces.</summary>
    public static string Compact(JsonNode? value)
    {
        var builder = new StringBuilder();
        WriteCompact(builder, value);
        return builder.ToString();
    }

    /// <summary>A string as a JSON string literal, escaped as JSON.stringify escapes it.</summary>
    public static string Quote(string text)
    {
        var builder = new StringBuilder(text.Length + 2);
        AppendString(builder, text);
        return builder.ToString();
    }

    /// <summary>
    /// A number as JavaScript writes it: integers without a decimal point,
    /// the shortest text that reads back as the same double, and exponent
    /// notation outside 1e-7 to 1e21. Non-finite numbers are written as null.
    /// </summary>
    public static string Number(double value)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            return "null";
        }

        if (value == 0)
        {
            return "0";
        }

        var text = value.ToString("R", CultureInfo.InvariantCulture);
        var negative = text.StartsWith('-');
        if (negative)
        {
            text = text[1..];
        }

        var exponent = 0;
        var e = text.IndexOfAny(['E', 'e']);
        if (e >= 0)
        {
            exponent = int.Parse(text[(e + 1)..], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
            text = text[..e];
        }

        var point = text.IndexOf('.');
        var integerDigits = point < 0 ? text.Length : point;
        var digits = text.Replace(".", string.Empty, StringComparison.Ordinal);
        var leading = 0;
        while (leading < digits.Length - 1 && digits[leading] == '0')
        {
            leading++;
        }

        digits = digits[leading..].TrimEnd('0');
        if (digits.Length == 0)
        {
            return "0";
        }

        // value = 0.digits × 10^n, as ECMAScript's Number::toString defines n.
        var n = integerDigits - leading + exponent;
        var k = digits.Length;
        string result;
        if (k <= n && n <= 21)
        {
            result = digits + new string('0', n - k);
        }
        else if (0 < n && n <= 21)
        {
            result = digits[..n] + "." + digits[n..];
        }
        else if (-6 < n && n <= 0)
        {
            result = "0." + new string('0', -n) + digits;
        }
        else
        {
            var power = n - 1;
            var mantissa = k == 1 ? digits : digits[..1] + "." + digits[1..];
            result = mantissa + "e" + (power < 0 ? "-" : "+") + Math.Abs(power).ToString(CultureInfo.InvariantCulture);
        }

        return negative ? "-" + result : result;
    }

    /// <summary>The text of a number node.</summary>
    public static string NumberText(JsonValue value)
    {
        if (value.TryGetValue<long>(out var whole))
        {
            return whole.ToString(CultureInfo.InvariantCulture);
        }

        if (value.TryGetValue<int>(out var small))
        {
            return small.ToString(CultureInfo.InvariantCulture);
        }

        if (value.TryGetValue<JsonElement>(out var element))
        {
            if (element.TryGetInt64(out var parsed))
            {
                return parsed.ToString(CultureInfo.InvariantCulture);
            }

            return Number(element.GetDouble());
        }

        if (value.TryGetValue<double>(out var real))
        {
            return Math.Abs(real) <= SafeInteger && Math.Floor(real) == real
                ? ((long)real).ToString(CultureInfo.InvariantCulture)
                : Number(real);
        }

        if (value.TryGetValue<decimal>(out var dec))
        {
            return Number((double)dec);
        }

        return Number(value.GetValue<double>());
    }

    /// <summary>The keys of an object in the order the shape gives.</summary>
    public static IReadOnlyList<string> KeyOrder(JsonObject value, JsonShape shape)
    {
        var present = value.Select(pair => pair.Key).ToList();
        if (shape.Order is null)
        {
            present.Sort(CodePointComparer.Instance);
            return present;
        }

        var known = shape.Order.Where(present.Contains).ToList();
        var rest = present.Where(key => !shape.Order.Contains(key)).ToList();
        rest.Sort(CodePointComparer.Instance);
        known.AddRange(rest);
        return known;
    }

    private static void Write(StringBuilder builder, JsonNode? value, JsonShape shape, int depth)
    {
        switch (value)
        {
            case null:
                builder.Append("null");
                return;
            case JsonArray array:
                if (array.Count == 0)
                {
                    builder.Append("[]");
                    return;
                }

                builder.Append("[\n");
                var items = shape.Items ?? JsonShape.Value;
                for (var i = 0; i < array.Count; i++)
                {
                    Pad(builder, depth + 1);
                    Write(builder, array[i], items, depth + 1);
                    builder.Append(i + 1 < array.Count ? ",\n" : "\n");
                }

                Pad(builder, depth);
                builder.Append(']');
                return;
            case JsonObject obj:
                var keys = KeyOrder(obj, shape);
                if (keys.Count == 0)
                {
                    builder.Append("{}");
                    return;
                }

                builder.Append("{\n");
                for (var i = 0; i < keys.Count; i++)
                {
                    Pad(builder, depth + 1);
                    AppendString(builder, keys[i]);
                    builder.Append(": ");
                    Write(builder, obj[keys[i]], shape.Field(keys[i]), depth + 1);
                    builder.Append(i + 1 < keys.Count ? ",\n" : "\n");
                }

                Pad(builder, depth);
                builder.Append('}');
                return;
            case JsonValue scalar:
                WriteScalar(builder, scalar);
                return;
        }
    }

    private static void WriteCompact(StringBuilder builder, JsonNode? value)
    {
        switch (value)
        {
            case null:
                builder.Append("null");
                return;
            case JsonArray array:
                builder.Append('[');
                for (var i = 0; i < array.Count; i++)
                {
                    if (i > 0)
                    {
                        builder.Append(',');
                    }

                    WriteCompact(builder, array[i]);
                }

                builder.Append(']');
                return;
            case JsonObject obj:
                builder.Append('{');
                var keys = KeyOrder(obj, JsonShape.Value);
                for (var i = 0; i < keys.Count; i++)
                {
                    if (i > 0)
                    {
                        builder.Append(',');
                    }

                    AppendString(builder, keys[i]);
                    builder.Append(':');
                    WriteCompact(builder, obj[keys[i]]);
                }

                builder.Append('}');
                return;
            case JsonValue scalar:
                WriteScalar(builder, scalar);
                return;
        }
    }

    private static void WriteScalar(StringBuilder builder, JsonValue scalar)
    {
        switch (scalar.GetValueKind())
        {
            case JsonValueKind.String:
                AppendString(builder, scalar.GetValue<string>());
                return;
            case JsonValueKind.Number:
                builder.Append(NumberText(scalar));
                return;
            case JsonValueKind.True:
                builder.Append("true");
                return;
            case JsonValueKind.False:
                builder.Append("false");
                return;
            default:
                builder.Append("null");
                return;
        }
    }

    private static void Pad(StringBuilder builder, int depth) => builder.Append(' ', depth * 2);

    private static void AppendString(StringBuilder builder, string text)
    {
        builder.Append('"');
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            switch (c)
            {
                case '"':
                    builder.Append("\\\"");
                    break;
                case '\\':
                    builder.Append("\\\\");
                    break;
                case '\b':
                    builder.Append("\\b");
                    break;
                case '\f':
                    builder.Append("\\f");
                    break;
                case '\n':
                    builder.Append("\\n");
                    break;
                case '\r':
                    builder.Append("\\r");
                    break;
                case '\t':
                    builder.Append("\\t");
                    break;
                default:
                    if (c < 0x20)
                    {
                        AppendEscape(builder, c);
                    }
                    else if (char.IsHighSurrogate(c) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
                    {
                        builder.Append(c).Append(text[i + 1]);
                        i++;
                    }
                    else if (char.IsSurrogate(c))
                    {
                        // A lone surrogate cannot be written as UTF-8.
                        AppendEscape(builder, c);
                    }
                    else
                    {
                        builder.Append(c);
                    }

                    break;
            }
        }

        builder.Append('"');
    }

    private static void AppendEscape(StringBuilder builder, char c) =>
        builder.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
}
