using System.Text.Json.Nodes;

namespace Lekman.Qualify.Checks;

/// <summary>One recorded check, before redaction.</summary>
public sealed record CheckRecord
{
    /// <summary>0-based position in call order.</summary>
    public required int Seq { get; init; }

    /// <summary>What is checked.</summary>
    public required string Context { get; init; }

    /// <summary>The claim.</summary>
    public required string Description { get; init; }

    /// <summary>The shared matcher name.</summary>
    public required string Matcher { get; init; }

    /// <summary>The normalised expected value.</summary>
    public JsonNode? Expected { get; init; }

    /// <summary>The normalised actual value.</summary>
    public JsonNode? Actual { get; init; }

    /// <summary>Whether the check passed.</summary>
    public required bool Pass { get; init; }

    /// <summary>Whether the check is soft.</summary>
    public required bool Soft { get; init; }

    /// <summary>The <c>path:line</c> of the check.</summary>
    public required string Site { get; init; }

    /// <summary>The qualified name of the delegated function, for matcher <c>delegate</c>.</summary>
    public string? Delegate { get; init; }

    /// <summary>When the check was recorded.</summary>
    public required string At { get; init; }

    /// <summary>The check as JSON.</summary>
    public JsonObject ToJson()
    {
        var json = new JsonObject
        {
            ["seq"] = Seq,
            ["context"] = Context,
            ["description"] = Description,
            ["matcher"] = Matcher,
            ["expected"] = Expected?.DeepClone(),
            ["actual"] = Actual?.DeepClone(),
            ["pass"] = Pass,
            ["soft"] = Soft,
            ["site"] = Site,
        };
        if (Delegate is not null)
        {
            json["delegate"] = Delegate;
        }

        json["at"] = At;
        return json;
    }
}

/// <summary>An attachment held until the test ends: a JSON value, or bytes.</summary>
public sealed record PendingAttachment(string Filename, string ContentType, JsonNode? Json, byte[]? Bytes)
{
    /// <summary>Whether the attachment is a JSON document.</summary>
    public bool IsJson => Bytes is null;
}
