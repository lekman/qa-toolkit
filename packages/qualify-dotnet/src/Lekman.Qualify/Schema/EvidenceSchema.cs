using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace Lekman.Qualify.Schema;

/// <summary>
/// Validation against <c>spec/qualify/evidence.schema.json</c>, the normative
/// schema, which the build embeds as it is.
/// </summary>
public static class EvidenceSchema
{
    private static readonly Lazy<JsonSchema> Schema = new(Load);

    /// <summary>The schema's problems with a document, or an empty list when it is valid.</summary>
    public static IReadOnlyList<string> Problems(JsonNode? document)
    {
        using var parsed = JsonDocument.Parse(document?.ToJsonString() ?? "null");
        var results = Schema.Value.Evaluate(parsed.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List });
        if (results.IsValid)
        {
            return [];
        }

        var problems = new List<string>();
        foreach (var detail in results.Details ?? [])
        {
            if (detail.Errors is null)
            {
                continue;
            }

            foreach (var (keyword, message) in detail.Errors)
            {
                var at = detail.InstanceLocation.ToString();
                problems.Add($"{(at.Length == 0 ? "/" : at)}: {keyword}: {message}");
            }
        }

        if (problems.Count == 0)
        {
            problems.Add("/: does not match the evidence schema");
        }

        return [.. problems.Distinct(StringComparer.Ordinal)];
    }

    /// <summary>
    /// Rules the schema cannot express: each test's ID prefix equals its level.
    /// </summary>
    public static IReadOnlyList<string> LevelProblems(JsonNode? document)
    {
        var tests = document?["tests"] as JsonArray ?? (document?["test"] is JsonObject one ? [one.DeepClone()] : []);
        var problems = new List<string>();
        foreach (var test in tests)
        {
            var id = test?["id"]?.GetValue<string>() ?? string.Empty;
            var level = test?["level"]?.GetValue<string>() ?? string.Empty;
            if (!id.StartsWith(level + "-", StringComparison.Ordinal))
            {
                problems.Add($"test {id} does not match its level {level}");
            }
        }

        return problems;
    }

    private static JsonSchema Load()
    {
        using var stream = typeof(EvidenceSchema).Assembly.GetManifestResourceStream("Lekman.Qualify.evidence.schema.json")
            ?? throw new InvalidOperationException("the evidence schema is not embedded in Lekman.Qualify");
        using var reader = new StreamReader(stream);
        return JsonSchema.FromText(reader.ReadToEnd());
    }
}
