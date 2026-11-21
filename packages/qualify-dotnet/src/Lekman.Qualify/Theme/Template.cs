using System.Text;

namespace Lekman.Qualify.Theme;

/// <summary>A theme that cannot be used: a schema violation, a missing file, an unknown token. Exit 2.</summary>
public sealed class ThemeException(string message) : Exception(message);

/// <summary>The values tokens stand for, section 9.3 of the specification.</summary>
public sealed record TokenValues
{
    /// <summary>The resolved title.</summary>
    public required string Title { get; init; }

    /// <summary>The resolved classification.</summary>
    public required string Classification { get; init; }

    /// <summary>The resolved document ID.</summary>
    public required string DocumentId { get; init; }

    /// <summary><c>run.environment</c>.</summary>
    public required string Environment { get; init; }

    /// <summary>The levels present: <c>IQ</c>, <c>IQ and OQ</c>, <c>IQ, OQ and PQ</c>.</summary>
    public required string Levels { get; init; }

    /// <summary>The generation date, <c>YYYY-MM-DD</c>.</summary>
    public required string Date { get; init; }

    /// <summary><c>run.target.version</c>, or <c>-</c>.</summary>
    public required string Version { get; init; }

    /// <summary><c>Passed</c>, <c>Failed</c> or <c>Incomplete</c>.</summary>
    public required string Verdict { get; init; }

    /// <summary><c>run.id</c>.</summary>
    public required string RunId { get; init; }

    /// <summary>The first 12 characters of the run file's SHA-256.</summary>
    public required string Sha12 { get; init; }

    /// <summary>The value of a token, with the page number and count for the header and footer.</summary>
    public string Get(string token, string? page = null, string? pages = null) => token switch
    {
        "title" => Title,
        "classification" => Classification,
        "documentId" => DocumentId,
        "environment" => Environment,
        "levels" => Levels,
        "date" => Date,
        "version" => Version,
        "verdict" => Verdict,
        "runId" => RunId,
        "sha12" => Sha12,
        "page" => page ?? string.Empty,
        "pages" => pages ?? string.Empty,
        _ => string.Empty,
    };
}

/// <summary>Theme text templates: <c>{token}</c> substitution with <c>{{</c> and <c>}}</c> escapes.</summary>
public static class Template
{
    private static readonly string[] Common = ["date", "documentId", "environment", "levels", "runId", "sha12", "verdict", "version"];

    /// <summary>
    /// Which tokens each text may use. Title and classification are resolved
    /// first, so they may not use each other or themselves; page numbers exist
    /// only in the header and footer.
    /// </summary>
    private static readonly Dictionary<string, string[]> Allowed = new(StringComparer.Ordinal)
    {
        ["title"] = Common,
        ["classification"] = Common,
        ["subtitle"] = [.. Common, "title", "classification"],
        ["header"] = [.. Common, "title", "classification", "page", "pages"],
        ["footer"] = [.. Common, "title", "classification", "page", "pages"],
    };

    /// <summary>A part of a template: literal text, or a token name.</summary>
    public sealed record Part(string? Text, string? Token);

    /// <summary>Split a template into text and tokens. Unbalanced braces throw.</summary>
    public static IReadOnlyList<Part> Parse(string template, string where)
    {
        ArgumentNullException.ThrowIfNull(template);
        var parts = new List<Part>();
        var text = new StringBuilder();
        for (var i = 0; i < template.Length; i++)
        {
            var c = template[i];
            var next = i + 1 < template.Length ? template[i + 1] : '\0';
            if (c == '{' && next == '{')
            {
                text.Append('{');
                i++;
            }
            else if (c == '}' && next == '}')
            {
                text.Append('}');
                i++;
            }
            else if (c == '{')
            {
                var end = template.IndexOf('}', i + 1);
                if (end < 0)
                {
                    throw new ThemeException($"{where}: a \"{{\" is not closed; write \"{{{{\" for a literal brace");
                }

                if (text.Length > 0)
                {
                    parts.Add(new Part(text.ToString(), null));
                    text.Clear();
                }

                parts.Add(new Part(null, template[(i + 1)..end]));
                i = end;
            }
            else if (c == '}')
            {
                throw new ThemeException($"{where}: a \"}}\" has no \"{{\"; write \"}}}}\" for a literal brace");
            }
            else
            {
                text.Append(c);
            }
        }

        if (text.Length > 0)
        {
            parts.Add(new Part(text.ToString(), null));
        }

        return parts;
    }

    /// <summary>Render a template whose tokens were checked.</summary>
    public static string Render(string template, TokenValues values, string? page = null, string? pages = null)
    {
        ArgumentNullException.ThrowIfNull(values);
        return string.Concat(Parse(template, "template").Select(part => part.Text ?? values.Get(part.Token!, page, pages)));
    }

    /// <summary>Check every text of a theme. Throws naming the first token a text may not use.</summary>
    public static void Validate(IReadOnlyDictionary<string, string> texts, string where)
    {
        ArgumentNullException.ThrowIfNull(texts);
        foreach (var (name, template) in texts)
        {
            var allowed = Allowed.GetValueOrDefault(name) ?? Common;
            foreach (var part in Parse(template, $"{where}: texts.{name}"))
            {
                if (part.Token is not null && !allowed.Contains(part.Token))
                {
                    throw new ThemeException(
                        $"{where}: texts.{name} uses {{{part.Token}}}, which is not a token it may use ({string.Join(", ", allowed.Select(t => $"{{{t}}}"))})");
                }
            }
        }
    }
}
