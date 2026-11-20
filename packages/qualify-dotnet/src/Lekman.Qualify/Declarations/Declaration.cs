using System.Text.Json.Nodes;

namespace Lekman.Qualify.Declarations;

/// <summary>A test's declaration after validation: the fields the started marker and the record share.</summary>
public sealed record Declaration
{
    /// <summary>The test ID, for example OQ-EXPORT-003.</summary>
    public required string Id { get; init; }

    /// <summary>IQ, OQ, PQ or IU.</summary>
    public required string Level { get; init; }

    /// <summary>One line.</summary>
    public required string Title { get; init; }

    /// <summary>The starting state.</summary>
    public required string Given { get; init; }

    /// <summary>The action.</summary>
    public required string When { get; init; }

    /// <summary>The expected result.</summary>
    public required string Then { get; init; }

    /// <summary>Further clauses, or null when none were declared.</summary>
    public IReadOnlyList<string>? And { get; init; }

    /// <summary><c>read</c> or <c>read-write</c>.</summary>
    public required string Scope { get; init; }

    /// <summary>Requirement IDs in declaration order.</summary>
    public required IReadOnlyList<string> Requirements { get; init; }

    /// <summary><c>high</c>, <c>medium</c>, <c>low</c>, or null.</summary>
    public string? Risk { get; init; }

    /// <summary>Tags, sorted, without duplicates.</summary>
    public required IReadOnlyList<string> Tags { get; init; }

    /// <summary>The ID of the negative test this test is the control for, or null.</summary>
    public string? Controls { get; init; }

    /// <summary>The repository-relative <c>path:line</c> of the declaration.</summary>
    public required string Site { get; init; }

    /// <summary>The declaration as JSON, keys in schema order.</summary>
    public JsonObject ToJson()
    {
        var json = new JsonObject
        {
            ["id"] = Id,
            ["level"] = Level,
            ["title"] = Title,
            ["given"] = Given,
            ["when"] = When,
            ["then"] = Then,
        };
        if (And is not null)
        {
            json["and"] = new JsonArray([.. And.Select(clause => (JsonNode)clause)]);
        }

        json["scope"] = Scope;
        json["requirements"] = new JsonArray([.. Requirements.Select(r => (JsonNode)r)]);
        if (Risk is not null)
        {
            json["risk"] = Risk;
        }

        json["tags"] = new JsonArray([.. Tags.Select(t => (JsonNode)t)]);
        if (Controls is not null)
        {
            json["controls"] = Controls;
        }

        json["site"] = Site;
        return json;
    }
}
