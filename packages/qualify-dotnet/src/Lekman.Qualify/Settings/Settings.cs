using System.Globalization;
using Lekman.Qualify.Declarations;

namespace Lekman.Qualify.Settings;

/// <summary>A test allowed to write in production, and why.</summary>
public sealed record PolicyOverride(string Id, string Reason);

/// <summary>A setting that cannot be used. The tests fail before they start.</summary>
public sealed class ConfigurationException(string message) : Exception(message);

/// <summary>Settings resolved from environment variables and options.</summary>
public sealed record ResolvedSettings
{
    /// <summary>The environment name.</summary>
    public required string Environment { get; init; }

    /// <summary>Environment names treated as production.</summary>
    public required IReadOnlyList<string> Production { get; init; }

    /// <summary>Whether read-write tests are blocked here.</summary>
    public bool ProductionWriteBlocked => Production.Contains(Environment);

    /// <summary>Tests allowed to write in production.</summary>
    public required IReadOnlyList<PolicyOverride> Overrides { get; init; }

    /// <summary>The evidence directory, possibly relative.</summary>
    public required string EvidenceDir { get; init; }

    /// <summary>The attachment size limit in bytes.</summary>
    public required long AttachmentLimit { get; init; }

    /// <summary>"Not applicable" rules.</summary>
    public required IReadOnlyList<NotApplicableRule> NotApplicable { get; init; }

    /// <summary>Reads a named secret.</summary>
    public required Func<string, string?> ReadSecret { get; init; }
}

/// <summary>
/// Resolves settings from environment variables and options, as section 5 of
/// the specification defines them. Pure: the caller passes the variables in.
/// </summary>
public static class SettingsResolver
{
    /// <summary>The attachment size limit used when none is set: 1 MiB.</summary>
    public const long DefaultAttachmentLimit = 1024 * 1024;

    /// <summary>The evidence directory used when none is set, relative to the working directory.</summary>
    public const string DefaultEvidenceDir = "qualification/evidence";

    private static readonly string[] DefaultProduction = ["production", "prod"];

    /// <summary>Resolve every setting. Invalid settings throw <see cref="ConfigurationException"/>.</summary>
    public static ResolvedSettings Resolve(IReadOnlyDictionary<string, string> env, QualifyOptions? options = null)
    {
        options ??= new QualifyOptions();
        var environment = Environment(env, options);
        var productionText = Set(env, "QUALIFY_PRODUCTION");
        IReadOnlyList<string> production = productionText is not null
            ? List(productionText)
            : options.Production is not null
                ? [.. options.Production.Select(p => p.Trim()).Where(p => p.Length > 0)]
                : DefaultProduction;

        var allowText = Set(env, "QUALIFY_ALLOW_WRITE");
        var overrides = allowText is not null
            ? Overrides(allowText)
            : options.AllowWrite is not null
                ? Overrides(options.AllowWrite.Select(pair => (pair.Key.Trim(), pair.Value.Trim())))
                : [];
        var noOverridesText = Set(env, "QUALIFY_NO_OVERRIDES");
        var noOverrides = noOverridesText is not null ? Flag(noOverridesText) : options.NoOverrides == true;
        if (noOverrides && overrides.Count > 0)
        {
            throw new ConfigurationException(
                $"QUALIFY_NO_OVERRIDES refuses every override, and QUALIFY_ALLOW_WRITE gives {string.Join(", ", overrides.Select(o => o.Id))}");
        }

        var limitText = Set(env, "QUALIFY_ATTACHMENT_LIMIT");
        var limit = limitText is not null
            ? Limit(limitText)
            : options.AttachmentLimit ?? DefaultAttachmentLimit;
        if (limit < 0)
        {
            throw new ConfigurationException($"QUALIFY_ATTACHMENT_LIMIT must be a whole number of bytes, got {limit}");
        }

        return new ResolvedSettings
        {
            Environment = environment,
            Production = production,
            Overrides = overrides,
            EvidenceDir = Set(env, "QUALIFY_EVIDENCE_DIR") ?? Blank(options.EvidenceDir) ?? DefaultEvidenceDir,
            AttachmentLimit = limit,
            NotApplicable = options.NotApplicable ?? [],
            ReadSecret = options.SecretSource ?? (name => env.TryGetValue("QUALIFY_SECRET_" + name, out var value) ? value : null),
        };
    }

    /// <summary>
    /// The environment name. A configured resolver replaces the default; if it
    /// throws or returns nothing, the environment is <c>production</c>.
    /// </summary>
    public static string Environment(IReadOnlyDictionary<string, string> env, QualifyOptions options)
    {
        if (options.ResolveEnvironment is not null)
        {
            try
            {
                var name = options.ResolveEnvironment();
                return string.IsNullOrWhiteSpace(name) ? "production" : name.Trim();
            }
            catch (Exception)
            {
                return "production";
            }
        }

        return Set(env, "QUALIFY_ENVIRONMENT")?.Trim() ?? Blank(options.Environment)?.Trim() ?? "local";
    }

    /// <summary>
    /// Parse <c>QUALIFY_ALLOW_WRITE</c>: <c>ID=reason</c> pairs separated by
    /// <c>;</c>. Each ID must be a test ID and each reason non-empty.
    /// </summary>
    public static IReadOnlyList<PolicyOverride> Overrides(string value) =>
        Overrides(value.Split(';')
            .Select(entry => entry.Trim())
            .Where(entry => entry.Length > 0)
            .Select(entry =>
            {
                var at = entry.IndexOf('=', StringComparison.Ordinal);
                return at < 0 ? (entry, string.Empty) : (entry[..at].Trim(), entry[(at + 1)..].Trim());
            }));

    private static List<PolicyOverride> Overrides(IEnumerable<(string Id, string Reason)> pairs)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<PolicyOverride>();
        foreach (var (id, reason) in pairs)
        {
            if (!DeclarationRules.IsTestId(id))
            {
                throw new ConfigurationException($"QUALIFY_ALLOW_WRITE names {id}, which is not a test ID");
            }

            if (reason.Length == 0)
            {
                throw new ConfigurationException($"QUALIFY_ALLOW_WRITE gives no reason for {id}; write {id}=<reason>");
            }

            if (!seen.Add(id))
            {
                throw new ConfigurationException($"QUALIFY_ALLOW_WRITE names {id} twice");
            }

            result.Add(new PolicyOverride(id, reason));
        }

        return result;
    }

    private static long Limit(string text) =>
        long.TryParse(text.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var limit)
            ? limit
            : throw new ConfigurationException($"QUALIFY_ATTACHMENT_LIMIT must be a whole number of bytes, got {text}");

    private static string[] List(string value) =>
        [.. value.Split(',').Select(item => item.Trim()).Where(item => item.Length > 0)];

    private static bool Flag(string value) =>
        value.Trim().ToLowerInvariant() is "1" or "true" or "yes";

    private static string? Set(IReadOnlyDictionary<string, string> env, string name) =>
        env.TryGetValue(name, out var value) ? Blank(value) : null;

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}

/// <summary>Write protection and "not applicable" rules, section 5 of the specification.</summary>
public static class Policy
{
    /// <summary>The reason to skip a test before its body runs, or null to run it.</summary>
    public static string? SkipReason(Declaration declaration, ResolvedSettings settings)
    {
        if (settings.ProductionWriteBlocked &&
            declaration.Scope == "read-write" &&
            !settings.Overrides.Any(o => o.Id == declaration.Id))
        {
            return $"read-write test blocked in production environment {settings.Environment}";
        }

        foreach (var rule in settings.NotApplicable)
        {
            var tagMatch = rule.Tags is null || rule.Tags.Any(declaration.Tags.Contains);
            var environmentMatch = rule.Environments is null || rule.Environments.Contains(settings.Environment);
            if (tagMatch && environmentMatch)
            {
                return rule.Reason;
            }
        }

        return null;
    }
}
