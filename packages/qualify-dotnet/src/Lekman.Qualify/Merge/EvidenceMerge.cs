using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Redaction;
using Lekman.Qualify.Schema;
using Lekman.Qualify.Values;

namespace Lekman.Qualify.Merge;

/// <summary>One file of a records directory: its name and its text.</summary>
public sealed record MergeInput(string Name, string Text);

/// <summary>What <c>merge</c> produced: the run file and the exit code, or the reasons it wrote nothing.</summary>
public sealed record MergeResult(int ExitCode, JsonObject? File, IReadOnlyList<string> Errors)
{
    /// <summary>Whether a run file was built.</summary>
    public bool Ok => File is not null;
}

/// <summary>
/// <c>qualify merge</c>: builds the run file from records and markers, as
/// section 6.5 of the specification defines it. Pure: the caller reads and writes.
/// </summary>
public static class EvidenceMerge
{
    private static readonly string[] Agree = ["environment", "source", "policy"];

    /// <summary>Merge the files of one records directory.</summary>
    /// <param name="inputs">The files, by name.</param>
    /// <param name="allowRuns">Other run IDs that may be merged in.</param>
    /// <param name="emptyEnvelope">The envelope to use when there are no records.</param>
    /// <param name="now">The current time.</param>
    public static MergeResult Build(
        IEnumerable<MergeInput> inputs,
        IReadOnlyCollection<string> allowRuns,
        Func<JsonObject> emptyEnvelope,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(inputs);
        ArgumentNullException.ThrowIfNull(emptyEnvelope);
        var errors = new List<string>();
        var pairs = new SortedDictionary<string, Pair>(CodePointComparer.Instance);

        foreach (var input in inputs.OrderBy(i => i.Name, CodePointComparer.Instance))
        {
            if (input.Name.StartsWith('.'))
            {
                continue;
            }

            var parsed = EvidenceFiles.Parse(input.Name);
            if (parsed is null)
            {
                errors.Add($"{input.Name}: not a record or marker name (<runId>__<testId>__<key>.json or .started)");
                continue;
            }

            JsonNode? data;
            try
            {
                data = JsonNode.Parse(input.Text);
            }
            catch (JsonException exception)
            {
                errors.Add($"{input.Name}: not valid JSON ({exception.Message})");
                continue;
            }

            var problems = EvidenceSchema.Problems(data);
            if (problems.Count > 0)
            {
                errors.AddRange(problems.Select(p => $"{input.Name}: {p}"));
                continue;
            }

            var file = (JsonObject)data!;
            var kind = Text(file, "kind");
            var expectedKind = parsed.IsMarker ? "started" : "record";
            if (kind != expectedKind)
            {
                errors.Add($"{input.Name}: holds a {kind} file, not a {expectedKind}");
                continue;
            }

            var runId = Text(file["run"], "id");
            var testId = Text(file["test"], "id");
            if (runId != parsed.RunId || testId != parsed.TestId)
            {
                errors.Add($"{input.Name}: the name does not match run {runId} and test {testId}");
                continue;
            }

            var level = Text(file["test"], "level");
            if (!testId.StartsWith(level + "-", StringComparison.Ordinal))
            {
                errors.Add($"{input.Name}: test {testId} does not match its level {level}");
                continue;
            }

            if (!pairs.TryGetValue(parsed.Stem, out var pair))
            {
                pair = new Pair();
                pairs[parsed.Stem] = pair;
            }

            if (parsed.IsMarker)
            {
                pair.Marker = new Named(input.Name, file);
            }
            else
            {
                pair.Record = new Named(input.Name, file);
            }
        }

        if (errors.Count > 0)
        {
            return new MergeResult(2, null, errors);
        }

        var all = pairs.Values.SelectMany(p => new[] { p.Marker, p.Record }).OfType<Named>().ToList();
        var ids = all.Select(f => Text(f.File["run"], "id")).Distinct(StringComparer.Ordinal).OrderBy(id => id, CodePointComparer.Instance).ToList();
        var primaries = ids.Where(id => !allowRuns.Contains(id)).ToList();
        if (primaries.Count > 1)
        {
            return new MergeResult(2, null, [$"records come from more than one run ({string.Join(", ", primaries)}); name the runs to merge in with --allow-runs"]);
        }

        if (primaries.Count == 0 && ids.Count > 0)
        {
            return new MergeResult(2, null, ["--allow-runs names every run in the directory; leave the main run out"]);
        }

        var primary = primaries.FirstOrDefault();
        var merged = ids.Where(id => id != primary).ToList();

        errors.AddRange(Duplicates(pairs));
        errors.AddRange(Disagreements(all));
        if (errors.Count > 0)
        {
            return new MergeResult(2, null, errors);
        }

        var tests = pairs.Values.Select(Test).OrderBy(t => Text(t, "id"), CodePointComparer.Instance).ToList();
        var run = Envelope(all, primary, merged, tests, emptyEnvelope, now);
        var summary = Summary(tests);
        var verdict = Text(summary, "verdict");
        var runFile = new JsonObject
        {
            ["schemaVersion"] = 1,
            ["kind"] = "run",
            ["run"] = run,
            ["summary"] = summary,
            ["tests"] = new JsonArray([.. tests]),
        };
        return new MergeResult(verdict == "fail" ? 1 : verdict == "incomplete" ? 3 : 0, runFile, []);
    }

    /// <summary>Counts and verdict: fail on any fail or error, incomplete with no tests.</summary>
    public static JsonObject Summary(IReadOnlyCollection<JsonObject> tests)
    {
        int Count(string outcome) => tests.Count(t => Text(t, "outcome") == outcome);
        var fail = Count("fail");
        var error = Count("error");
        return new JsonObject
        {
            ["total"] = tests.Count,
            ["pass"] = Count("pass"),
            ["fail"] = fail,
            ["error"] = error,
            ["skip"] = Count("skip"),
            ["verdict"] = fail + error > 0 ? "fail" : tests.Count == 0 ? "incomplete" : "pass",
        };
    }

    private static string Text(JsonNode? node, string key) => node?[key]?.GetValue<string>() ?? string.Empty;

    private static IEnumerable<string> Duplicates(SortedDictionary<string, Pair> pairs) =>
        pairs
            .GroupBy(pair => Text((pair.Value.Record ?? pair.Value.Marker)!.File["test"], "id"), StringComparer.Ordinal)
            .Where(group => group.Count() > 1)
            .Select(group =>
                $"test ID {group.Key} appears {group.Count()} times in the run ({string.Join(", ", group.Select(p => p.Key))}); an ID must be unique within a run");

    private static IEnumerable<string> Disagreements(IReadOnlyList<Named> all)
    {
        if (all.Count == 0)
        {
            yield break;
        }

        var first = all[0];
        foreach (var field in Agree)
        {
            var expected = Normaliser.Key(first.File["run"]![field]);
            var other = all.FirstOrDefault(f => Normaliser.Key(f.File["run"]![field]) != expected);
            if (other is not null)
            {
                yield return $"the run envelopes disagree on {field}: {first.Name} and {other.Name}";
            }
        }
    }

    private static JsonObject Envelope(
        IReadOnlyList<Named> all,
        string? primary,
        List<string> merged,
        List<JsonObject> tests,
        Func<JsonObject> emptyEnvelope,
        DateTimeOffset now)
    {
        var source = all
            .Where(f => Text(f.File["run"], "id") == primary)
            .OrderBy(f => Text(f.File["test"], "id"), CodePointComparer.Instance)
            .Select(f => (JsonObject)f.File["run"]!)
            .FirstOrDefault() ?? emptyEnvelope();
        var run = (JsonObject)Redactor.Value(source, [])!;
        var selection = run["selection"]?.DeepClone();
        run.Remove("selection");
        var selections = all.Select(f => Normaliser.Key(f.File["run"]!["selection"])).Distinct(StringComparer.Ordinal).Count();
        if (selection is not null && selections == 1)
        {
            run["selection"] = selection;
        }

        var stamp = Normaliser.Timestamp(now);
        run["startedAt"] = tests.Count > 0 ? tests.Select(t => Text(t, "startedAt")).Min(StringComparer.Ordinal) : stamp;
        run["endedAt"] = tests.Count > 0 ? tests.Select(t => Text(t, "endedAt")).Max(StringComparer.Ordinal) : stamp;
        if (merged.Count > 0)
        {
            run["mergedRuns"] = new JsonArray([.. merged.Select(id => (JsonNode)id)]);
        }

        return run;
    }

    private static JsonObject Test(Pair pair)
    {
        if (pair.Record is not null)
        {
            return Defend((JsonObject)pair.Record.File["test"]!);
        }

        var marker = (JsonObject)pair.Marker!.File["test"]!.DeepClone();
        var startedAt = marker["startedAt"]!.DeepClone();
        marker.Remove("startedAt");
        marker["outcome"] = "error";
        marker["error"] = new JsonObject
        {
            ["type"] = "DidNotFinish",
            ["message"] = "test started and did not finish",
            ["site"] = null,
        };
        marker["startedAt"] = startedAt;
        marker["endedAt"] = startedAt.DeepClone();
        marker["durationMs"] = 0;
        marker["checks"] = new JsonArray();
        marker["attachments"] = new JsonArray();
        marker["secretsUsed"] = new JsonArray();
        return Defend(marker);
    }

    /// <summary>Apply the pattern rules again, decoding attachments to redact their bytes.</summary>
    private static JsonObject Defend(JsonObject test)
    {
        var copy = (JsonObject)test.DeepClone();
        var attachments = (JsonArray)copy["attachments"]!;
        copy.Remove("attachments");
        var redacted = (JsonObject)Redactor.Value(copy, [])!;
        var clean = new JsonArray();
        foreach (var node in attachments)
        {
            var attachment = (JsonObject)node!.DeepClone();
            var bytes = Convert.FromBase64String(Text(attachment, "content"));
            var defended = Redactor.Bytes(bytes, []);
            if (!ReferenceEquals(defended, bytes))
            {
                attachment["content"] = Convert.ToBase64String(defended);
                attachment["sizeBytes"] = defended.LongLength;
                attachment["sha256"] = EvidenceFiles.Sha256(defended);
            }

            clean.Add(attachment);
        }

        redacted["attachments"] = clean;
        return redacted;
    }

    private sealed record Named(string Name, JsonObject File);

    private sealed class Pair
    {
        public Named? Marker { get; set; }

        public Named? Record { get; set; }
    }
}

/// <summary>Reading a records directory and writing the run file. System layer.</summary>
public static class MergeFiles
{
    /// <summary>Read every file in a records directory, skipping names that start with a dot.</summary>
    public static IReadOnlyList<MergeInput> Read(string recordsDir)
    {
        if (!Directory.Exists(recordsDir))
        {
            return [];
        }

        return [.. Directory.EnumerateFiles(recordsDir)
            .Select(Path.GetFileName)
            .Where(name => name is not null && !name.StartsWith('.'))
            .Select(name => new MergeInput(name!, File.ReadAllText(Path.Combine(recordsDir, name!), Encoding.UTF8)))];
    }
}
