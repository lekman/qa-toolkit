using System.Text.RegularExpressions;
using Lekman.Qualify.Values;

namespace Lekman.Qualify.Declarations;

/// <summary>What a test attribute declares, before validation.</summary>
public sealed record DeclarationInput
{
    /// <summary>IQ, OQ, PQ or IU, from the attribute's name.</summary>
    public required string Level { get; init; }

    /// <summary>The declared ID, which may itself be the problem.</summary>
    public string? Id { get; init; }

    /// <summary>The declared title.</summary>
    public string? Title { get; init; }

    /// <summary>The starting state.</summary>
    public string? Given { get; init; }

    /// <summary>The action.</summary>
    public string? When { get; init; }

    /// <summary>The expected result.</summary>
    public string? Then { get; init; }

    /// <summary>Further clauses.</summary>
    public IReadOnlyList<string?>? And { get; init; }

    /// <summary>The declared scope, or <see cref="Qualify.Scope.NotSet"/>.</summary>
    public Scope Scope { get; init; }

    /// <summary>Requirement IDs.</summary>
    public IReadOnlyList<string?>? Requirements { get; init; }

    /// <summary>The declared risk, or <see cref="Qualify.Risk.NotSet"/>.</summary>
    public Risk Risk { get; init; }

    /// <summary>Tags.</summary>
    public IReadOnlyList<string?>? Tags { get; init; }

    /// <summary>The ID of the negative test this test is the control for.</summary>
    public string? Controls { get; init; }
}

/// <summary>Validation of test declarations, sections 2.1 and 4 of the specification.</summary>
public static partial class DeclarationRules
{
    /// <summary>The pattern every test ID matches.</summary>
    public const string IdPattern = "^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$";

    private static readonly string[] Levels = ["IQ", "OQ", "PQ", "IU"];

    /// <summary>The name the runner shows: <c>[&lt;ID&gt;] &lt;title&gt;</c>.</summary>
    public static string DisplayName(string? id, string? title) => $"[{id}] {title}";

    /// <summary>Whether a string is a valid test ID for any level.</summary>
    public static bool IsTestId(string? value) => value is not null && IdRegex().IsMatch(value);

    /// <summary>
    /// Validate a declaration. Every problem is collected into one
    /// <see cref="DeclarationException"/>, so a test author sees them all at once.
    /// </summary>
    public static Declaration Validate(DeclarationInput input, string site)
    {
        var problems = new List<string>();
        var level = input.Level;
        var id = input.Id;

        if (!Levels.Contains(level))
        {
            problems.Add($"unknown level {level}");
        }

        if (!IsTestId(id))
        {
            problems.Add($"ID does not match the pattern {IdPattern}, for example OQ-EXPORT-003");
        }
        else if (!id!.StartsWith(level + "-", StringComparison.Ordinal))
        {
            problems.Add($"ID prefix {id[..2]} does not match the declared level {level}");
        }

        if (!HasText(input.Title))
        {
            problems.Add("title must not be empty");
        }
        else if (input.Title!.Contains('\n') || input.Title.Contains('\r'))
        {
            problems.Add("title must be one line");
        }

        if (!HasText(input.Given))
        {
            problems.Add("given must not be empty");
        }

        if (!HasText(input.When))
        {
            problems.Add("when must not be empty");
        }

        if (!HasText(input.Then))
        {
            problems.Add("then must not be empty");
        }

        if (input.And is not null && input.And.Any(clause => !HasText(clause)))
        {
            problems.Add("and must be a list of clauses, each not empty");
        }

        var scope = ScopeOf(level, input.Scope, problems);
        var requirements = RequirementsOf(input.Requirements, problems);
        var tags = TagsOf(input.Tags, problems);
        if (!Enum.IsDefined(input.Risk))
        {
            problems.Add("risk must be high, medium or low");
        }

        if (input.Controls is not null)
        {
            if (!IsTestId(input.Controls))
            {
                problems.Add("controls must be the ID of another qualification test");
            }
            else if (input.Controls == id)
            {
                problems.Add("a test cannot be the control for itself");
            }
        }

        if (problems.Count > 0)
        {
            throw new DeclarationException(id ?? "(no ID)", problems);
        }

        return new Declaration
        {
            Id = id!,
            Level = level,
            Title = input.Title!,
            Given = input.Given!,
            When = input.When!,
            Then = input.Then!,
            And = input.And?.Select(clause => clause!).ToList(),
            Scope = scope!,
            Requirements = requirements,
            Risk = input.Risk switch
            {
                Risk.High => "high",
                Risk.Medium => "medium",
                Risk.Low => "low",
                _ => null,
            },
            Tags = tags,
            Controls = input.Controls,
            Site = site,
        };
    }

    private static bool HasText(string? value) => !string.IsNullOrWhiteSpace(value);

    private static string? ScopeOf(string level, Scope scope, List<string> problems)
    {
        if (level is "IQ" or "IU")
        {
            if (scope != Scope.NotSet)
            {
                problems.Add($"scope must not be declared for {level} tests, which are always {(level == "IQ" ? "read" : "read-write")}");
            }

            return level == "IQ" ? "read" : "read-write";
        }

        switch (scope)
        {
            case Scope.Read:
                return "read";
            case Scope.ReadWrite:
                return "read-write";
            case Scope.NotSet:
                problems.Add($"scope is required for {level} tests (read or read-write)");
                return null;
            default:
                problems.Add("scope must be read or read-write");
                return null;
        }
    }

    private static List<string> RequirementsOf(IReadOnlyList<string?>? value, List<string> problems)
    {
        if (value is null)
        {
            return [];
        }

        if (value.Any(r => r is null || r.Length < 1 || r.Length > 64))
        {
            problems.Add("each requirement ID must be 1 to 64 characters");
        }

        var duplicates = value.Where(r => r is not null)
            .GroupBy(r => r!, StringComparer.Ordinal)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToList();
        if (duplicates.Count > 0)
        {
            problems.Add($"requirements are duplicated: {string.Join(", ", duplicates)}");
        }

        return [.. value.Select(r => r ?? string.Empty)];
    }

    private static List<string> TagsOf(IReadOnlyList<string?>? value, List<string> problems)
    {
        if (value is null)
        {
            return [];
        }

        if (value.Any(string.IsNullOrEmpty))
        {
            problems.Add("tags must be a list of strings, each not empty");
            return [];
        }

        var tags = value.Select(t => t!).Distinct(StringComparer.Ordinal).ToList();
        tags.Sort(CodePointComparer.Instance);
        return tags;
    }

    [GeneratedRegex(IdPattern, RegexOptions.CultureInvariant)]
    private static partial Regex IdRegex();
}
