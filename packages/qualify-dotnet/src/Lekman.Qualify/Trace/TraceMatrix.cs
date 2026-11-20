using System.Text.Json.Nodes;
using Lekman.Qualify.Declarations;
using Lekman.Qualify.Values;
using YamlDotNet.Core;
using YamlDotNet.RepresentationModel;

namespace Lekman.Qualify.Trace;

/// <summary>A protocol or map file that cannot be used. Exit 2.</summary>
public sealed class TraceInputException(string message) : Exception(message);

/// <summary>One test the protocol requires.</summary>
public sealed record ProtocolEntry(string Id, string Level, string Title, IReadOnlyList<string> Requirements, string? Risk);

/// <summary>One row of the trace matrix: a link between a requirement and a test result.</summary>
public sealed record TraceRow(
    string? Requirement,
    IReadOnlyList<string> Sources,
    string TestId,
    string Level,
    string Title,
    string? Risk,
    string? Controls,
    string Outcome,
    string? Run,
    string? Environment);

/// <summary>The rows, the protocol IDs with no record and the requirements with no passing test.</summary>
public sealed record TraceResult(IReadOnlyList<TraceRow> Rows, IReadOnlyList<string> NotRun, IReadOnlyList<string> RequirementsWithoutPass);

/// <summary>
/// The rows of the trace matrix, built as the TypeScript <c>trace</c> command
/// builds them (section 8 of the specification). The report draws them; the
/// <c>trace</c> command itself is in the TypeScript CLI.
/// </summary>
public static class TraceMatrix
{
    private static readonly string[] SourceOrder = ["code", "protocol", "map"];

    /// <summary>Build the matrix for one run file.</summary>
    public static TraceResult Build(JsonObject run, IReadOnlyList<ProtocolEntry>? protocol, IReadOnlyDictionary<string, IReadOnlyList<string>>? map)
    {
        ArgumentNullException.ThrowIfNull(run);
        var entries = (protocol ?? []).ToDictionary(e => e.Id, StringComparer.Ordinal);
        map ??= new Dictionary<string, IReadOnlyList<string>>();
        var runId = (string)run["run"]!["id"]!;
        var environment = (string)run["run"]!["environment"]!;
        var tests = ((JsonArray)run["tests"]!).Cast<JsonObject>().ToList();
        var seen = tests.Select(t => (string)t["id"]!).ToHashSet(StringComparer.Ordinal);

        var rows = new List<TraceRow>();
        foreach (var test in tests)
        {
            var id = (string)test["id"]!;
            entries.TryGetValue(id, out var entry);
            var code = ((JsonArray)test["requirements"]!).Select(r => (string)r!).ToList();
            foreach (var (requirement, sources) in Links(code, entry?.Requirements ?? [], map.GetValueOrDefault(id) ?? []))
            {
                rows.Add(new TraceRow(
                    requirement,
                    sources,
                    id,
                    (string)test["level"]!,
                    (string)test["title"]!,
                    (string?)test["risk"] ?? entry?.Risk,
                    (string?)test["controls"],
                    (string)test["outcome"]!,
                    runId,
                    environment));
            }
        }

        var notRun = entries.Keys.Where(id => !seen.Contains(id)).OrderBy(id => id, CodePointComparer.Instance).ToList();
        foreach (var id in notRun)
        {
            var entry = entries[id];
            foreach (var (requirement, sources) in Links([], entry.Requirements, map.GetValueOrDefault(id) ?? []))
            {
                rows.Add(new TraceRow(requirement, sources, id, entry.Level, entry.Title, entry.Risk, null, "not-run", null, null));
            }
        }

        var sorted = Sort(rows);
        var requirements = sorted.Where(r => r.Requirement is not null).Select(r => r.Requirement!)
            .Distinct(StringComparer.Ordinal).OrderBy(r => r, CodePointComparer.Instance).ToList();
        var withoutPass = requirements.Where(req => !sorted.Any(r => r.Requirement == req && r.Outcome == "pass")).ToList();
        return new TraceResult(sorted, notRun, withoutPass);
    }

    /// <summary>
    /// Parse <c>protocol.yaml</c>: the tests that must run, under a <c>tests</c> key.
    /// </summary>
    public static IReadOnlyList<ProtocolEntry> Protocol(string text, string path)
    {
        if (Read(text, path) is not YamlMappingNode root ||
            !root.Children.TryGetValue(new YamlScalarNode("tests"), out var testsNode) ||
            testsNode is not YamlSequenceNode tests)
        {
            throw new TraceInputException($"{path}: must have a \"tests\" list");
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<ProtocolEntry>();
        var index = 0;
        foreach (var raw in tests)
        {
            var where = $"{path}: tests[{index++}]";
            if (raw is not YamlMappingNode entry)
            {
                throw new TraceInputException($"{where}: must be a mapping");
            }

            var fields = new Dictionary<string, YamlNode>(StringComparer.Ordinal);
            foreach (var (key, value) in entry.Children)
            {
                var name = (key as YamlScalarNode)?.Value ?? string.Empty;
                if (name is not ("id" or "level" or "requirements" or "risk" or "title"))
                {
                    throw new TraceInputException($"{where}: unknown field {name}");
                }

                fields[name] = value;
            }

            var id = Scalar(fields.GetValueOrDefault("id"));
            if (!DeclarationRules.IsTestId(id))
            {
                throw new TraceInputException($"{where}: id must be a test ID");
            }

            var level = Scalar(fields.GetValueOrDefault("level"));
            if (level is not ("IQ" or "OQ" or "PQ" or "IU") || !id!.StartsWith(level + "-", StringComparison.Ordinal))
            {
                throw new TraceInputException($"{where}: level must be the prefix of {id}");
            }

            var title = Scalar(fields.GetValueOrDefault("title"));
            if (string.IsNullOrWhiteSpace(title))
            {
                throw new TraceInputException($"{where}: title must not be empty");
            }

            string? risk = null;
            if (fields.TryGetValue("risk", out var riskNode))
            {
                risk = Scalar(riskNode);
                if (risk is not ("high" or "medium" or "low"))
                {
                    throw new TraceInputException($"{where}: risk must be high, medium or low");
                }
            }

            if (!seen.Add(id!))
            {
                throw new TraceInputException($"{path}: {id} is listed twice");
            }

            var requirements = fields.TryGetValue("requirements", out var reqNode) ? Requirements(reqNode, where) : [];
            result.Add(new ProtocolEntry(id!, level, title, requirements, risk));
        }

        return result;
    }

    /// <summary>Parse <c>trace.yaml</c>: test IDs mapped to one requirement ID or a list.</summary>
    public static IReadOnlyDictionary<string, IReadOnlyList<string>> Map(string text, string path)
    {
        var data = Read(text, path);
        var result = new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        if (data is null || (data is YamlScalarNode empty && string.IsNullOrEmpty(empty.Value)))
        {
            return result;
        }

        if (data is not YamlMappingNode root)
        {
            throw new TraceInputException($"{path}: must map test IDs to requirement IDs");
        }

        foreach (var (key, value) in root.Children)
        {
            var id = Scalar(key);
            if (!DeclarationRules.IsTestId(id))
            {
                throw new TraceInputException($"{path}: {id} is not a test ID");
            }

            result[id!] = Requirements(value, $"{path}: {id}");
        }

        return result;
    }

    private static List<(string? Requirement, IReadOnlyList<string> Sources)> Links(
        IReadOnlyList<string> code,
        IReadOnlyList<string> protocol,
        IReadOnlyList<string> map)
    {
        var links = new List<(string Requirement, HashSet<string> Sources)>();
        void Add(IEnumerable<string> requirements, string source)
        {
            foreach (var requirement in requirements)
            {
                var at = links.FindIndex(l => l.Requirement == requirement);
                if (at < 0)
                {
                    links.Add((requirement, [source]));
                }
                else
                {
                    links[at].Sources.Add(source);
                }
            }
        }

        Add(code, "code");
        Add(protocol, "protocol");
        Add(map, "map");
        if (links.Count == 0)
        {
            return [(null, [])];
        }

        return [.. links.Select(l => ((string?)l.Requirement, (IReadOnlyList<string>)[.. SourceOrder.Where(l.Sources.Contains)]))];
    }

    /// <summary>
    /// Rows by requirement (none last), then test ID, then run. A control
    /// test sorts directly after the test it controls when both have rows
    /// under the same requirement, so the pair sits on adjacent rows.
    /// </summary>
    private static List<TraceRow> Sort(List<TraceRow> rows)
    {
        var present = rows.Select(r => $"{r.Requirement}\u0000{r.TestId}").ToHashSet(StringComparer.Ordinal);
        string Anchor(TraceRow row) =>
            row.Controls is not null && present.Contains($"{row.Requirement}\u0000{row.Controls}") ? row.Controls : row.TestId;
        int Nullable(string? a, string? b) =>
            a == b ? 0 : a is null ? 1 : b is null ? -1 : CodePointComparer.Instance.Compare(a, b);

        var sorted = rows.ToList();
        sorted.Sort((a, b) =>
        {
            var c = Nullable(a.Requirement, b.Requirement);
            if (c != 0)
            {
                return c;
            }

            c = CodePointComparer.Instance.Compare(Anchor(a), Anchor(b));
            if (c != 0)
            {
                return c;
            }

            c = (Anchor(a) != a.TestId ? 1 : 0) - (Anchor(b) != b.TestId ? 1 : 0);
            if (c != 0)
            {
                return c;
            }

            c = CodePointComparer.Instance.Compare(a.TestId, b.TestId);
            return c != 0 ? c : Nullable(a.Run, b.Run);
        });
        return sorted;
    }

    private static YamlNode? Read(string text, string path)
    {
        try
        {
            var stream = new YamlStream();
            stream.Load(new StringReader(text));
            return stream.Documents.Count == 0 ? null : stream.Documents[0].RootNode;
        }
        catch (YamlException error)
        {
            throw new TraceInputException($"{path}: not valid YAML ({error.Message})");
        }
    }

    private static string? Scalar(YamlNode? node) => (node as YamlScalarNode)?.Value;

    private static List<string> Requirements(YamlNode node, string where)
    {
        var list = node switch
        {
            YamlScalarNode scalar => [scalar.Value],
            YamlSequenceNode sequence => sequence.Children.Select(Scalar).ToList(),
            _ => null,
        };
        if (list is null || list.Any(r => r is null || r.Length < 1 || r.Length > 64))
        {
            throw new TraceInputException($"{where}: requirements must be requirement IDs of 1 to 64 characters");
        }

        if (list.Distinct(StringComparer.Ordinal).Count() != list.Count)
        {
            throw new TraceInputException($"{where}: a requirement is listed twice");
        }

        return [.. list.Select(r => r!)];
    }
}
