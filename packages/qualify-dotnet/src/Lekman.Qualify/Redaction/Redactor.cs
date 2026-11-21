using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Lekman.Qualify.Redaction;

/// <summary>
/// Redaction as section 7.2 of the specification defines it. Pure functions:
/// the caller holds the registered values and passes them in.
/// </summary>
public static class Redactor
{
    /// <summary>Values shorter than this are refused, because they would redact words.</summary>
    public const int MinLength = 6;

    /// <summary>The text every redacted value is replaced with.</summary>
    public const string Replacement = "[REDACTED]";

    private static readonly Regex[] Patterns =
    [
        // A PEM private key block, to the matching END line or, when the block
        // is cut short, to the end of the text.
        new(@"-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----(?:[\s\S]*?-----END \1PRIVATE KEY-----|[\s\S]*$)", RegexOptions.CultureInvariant),

        // A JWT shape: three base64url segments, the first starting with eyJ.
        new(@"eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", RegexOptions.CultureInvariant),

        // An access-key-ID shape.
        new(@"(?:AKIA|ASIA)[A-Z0-9]{16}", RegexOptions.CultureInvariant),
    ];

    private static readonly HashSet<string> SensitiveKeys =
        [with(StringComparer.Ordinal), "api_key", "apikey", "authorization", "passwd", "password", "privatekey", "secret", "token"];

    /// <summary>Apply the pattern rules only.</summary>
    public static string ApplyPatterns(string text)
    {
        var result = text;
        foreach (var pattern in Patterns)
        {
            result = pattern.Replace(result, Replacement);
        }

        return result;
    }

    /// <summary>Redact one string: registered values first, longest first, then the patterns.</summary>
    public static string Text(string text, IReadOnlyCollection<string> registered)
    {
        var result = text;
        foreach (var value in LongestFirst(registered))
        {
            result = result.Replace(value, Replacement, StringComparison.Ordinal);
        }

        return ApplyPatterns(result);
    }

    /// <summary>
    /// Redact bytes without decoding them as text. Registered values are
    /// matched as their UTF-8 bytes and the patterns as ASCII, so the bytes
    /// around a match never change. Returns the same array when nothing matched.
    /// </summary>
    public static byte[] Bytes(byte[] bytes, IReadOnlyCollection<string> registered)
    {
        var view = Encoding.Latin1.GetString(bytes);
        var before = view;
        foreach (var value in LongestFirst(registered))
        {
            view = view.Replace(Encoding.Latin1.GetString(Encoding.UTF8.GetBytes(value)), Replacement, StringComparison.Ordinal);
        }

        view = ApplyPatterns(view);
        return string.Equals(view, before, StringComparison.Ordinal) ? bytes : Encoding.Latin1.GetBytes(view);
    }

    /// <summary>Redact every string and key inside a JSON value. Returns a new tree.</summary>
    public static JsonNode? Value(JsonNode? value, IReadOnlyCollection<string> registered) => value switch
    {
        null => null,
        JsonArray array => new JsonArray([.. array.Select(item => Value(item, registered))]),
        JsonObject obj => Rebuild(obj, registered, (_, item) => Value(item, registered)),
        JsonValue scalar when scalar.GetValueKind() == System.Text.Json.JsonValueKind.String =>
            JsonValue.Create(Text(scalar.GetValue<string>(), registered)),
        _ => value.DeepClone(),
    };

    /// <summary>
    /// Redact a JSON document: values under sensitive keys (compared without
    /// case) become <c>[REDACTED]</c>, then every other string and key is
    /// redacted as text.
    /// </summary>
    public static JsonNode? Json(JsonNode? value, IReadOnlyCollection<string> registered) => value switch
    {
        JsonArray array => new JsonArray([.. array.Select(item => Json(item, registered))]),
        JsonObject obj => Rebuild(obj, registered, (key, item) =>
            SensitiveKeys.Contains(key.ToLowerInvariant()) ? JsonValue.Create(Replacement) : Json(item, registered)),
        _ => Value(value, registered),
    };

    private static JsonObject Rebuild(JsonObject obj, IReadOnlyCollection<string> registered, Func<string, JsonNode?, JsonNode?> map)
    {
        var result = new JsonObject();
        foreach (var (key, item) in obj)
        {
            result[Text(key, registered)] = map(key, item);
        }

        return result;
    }

    private static IEnumerable<string> LongestFirst(IReadOnlyCollection<string> registered) =>
        registered.Distinct(StringComparer.Ordinal).OrderByDescending(value => value.Length);
}
