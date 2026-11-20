using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lekman.Qualify.Settings;

namespace Lekman.Qualify.Envelope;

/// <summary>What git says about the working tree. Each value is null when git could not tell.</summary>
public sealed record GitFacts(string? Root, string? Commit, string? Branch, bool? Dirty)
{
    /// <summary>The facts when git is missing or the folder is not a repository.</summary>
    public static GitFacts None { get; } = new(null, null, null, null);
}

/// <summary>The tool that wrote the evidence.</summary>
public sealed record ToolInfo(string Name, string Version, string Language, string Runtime);

/// <summary>Builds the run envelope of section 6.4 of the specification from facts the caller gathered.</summary>
public static partial class RunEnvelope
{
    private const string TargetPrefix = "QUALIFY_TARGET_";

    /// <summary>The full envelope, keys in schema order.</summary>
    public static JsonObject Build(
        string runId,
        string environment,
        ToolInfo tool,
        GitFacts git,
        IReadOnlyDictionary<string, string> env,
        bool productionWriteBlocked,
        IReadOnlyList<PolicyOverride> overrides) => new()
        {
            ["id"] = runId,
            ["environment"] = environment,
            ["tool"] = new JsonObject
            {
                ["name"] = tool.Name,
                ["version"] = tool.Version,
                ["language"] = tool.Language,
                ["runtime"] = tool.Runtime,
            },
            ["source"] = Source(git, env),
            ["actor"] = Actor(env),
            ["target"] = Target(env),
            ["policy"] = new JsonObject
            {
                ["productionWriteBlocked"] = productionWriteBlocked,
                ["overrides"] = new JsonArray([.. overrides.Select(o => (JsonNode)new JsonObject { ["id"] = o.Id, ["reason"] = o.Reason })]),
            },
        };

    /// <summary>
    /// Who ran the tests. On GitHub Actions the actor and the run's URL;
    /// outside CI the user name from <c>USER</c> or <c>USERNAME</c>.
    /// </summary>
    public static JsonObject Actor(IReadOnlyDictionary<string, string> env)
    {
        if (Get(env, "GITHUB_ACTIONS") == "true")
        {
            var server = Get(env, "GITHUB_SERVER_URL");
            var repository = Get(env, "GITHUB_REPOSITORY");
            var run = Get(env, "GITHUB_RUN_ID");
            return new JsonObject
            {
                ["name"] = Get(env, "GITHUB_ACTOR"),
                ["ci"] = "github-actions",
                ["ciRunUrl"] = server is not null && repository is not null && run is not null
                    ? $"{server}/{repository}/actions/runs/{run}"
                    : null,
            };
        }

        return new JsonObject
        {
            ["name"] = Get(env, "USER") ?? Get(env, "USERNAME"),
            ["ci"] = null,
            ["ciRunUrl"] = null,
        };
    }

    /// <summary>
    /// The code under test. A detached head, as CI checks out, takes the branch
    /// from <c>GITHUB_HEAD_REF</c> or <c>GITHUB_REF_NAME</c> on GitHub Actions.
    /// </summary>
    public static JsonObject Source(GitFacts git, IReadOnlyDictionary<string, string> env)
    {
        var commit = git.Commit is not null && CommitRegex().IsMatch(git.Commit) ? git.Commit : null;
        var branch = string.IsNullOrEmpty(git.Branch) ? null : git.Branch;
        if (branch is null && git.Commit is not null && Get(env, "GITHUB_ACTIONS") == "true")
        {
            branch = Get(env, "GITHUB_HEAD_REF") ?? Get(env, "GITHUB_REF_NAME");
        }

        return new JsonObject { ["commit"] = commit, ["branch"] = branch, ["dirty"] = git.Dirty };
    }

    /// <summary>
    /// Declared facts about the target: <c>QUALIFY_TARGET_&lt;NAME&gt;</c> becomes
    /// <c>target.&lt;name&gt;</c>, lower-cased. A variable set but empty becomes null.
    /// </summary>
    public static JsonObject Target(IReadOnlyDictionary<string, string> env)
    {
        var target = new JsonObject();
        foreach (var (name, text) in env.OrderBy(pair => pair.Key, StringComparer.Ordinal))
        {
            if (!name.StartsWith(TargetPrefix, StringComparison.Ordinal) || name.Length == TargetPrefix.Length)
            {
                continue;
            }

            target[name[TargetPrefix.Length..].ToLowerInvariant()] = string.IsNullOrEmpty(text) ? null : text;
        }

        return target;
    }

    private static string? Get(IReadOnlyDictionary<string, string> env, string name) =>
        env.TryGetValue(name, out var value) && value.Length > 0 ? value : null;

    [GeneratedRegex("^[0-9a-f]{40}$")]
    private static partial Regex CommitRegex();
}
