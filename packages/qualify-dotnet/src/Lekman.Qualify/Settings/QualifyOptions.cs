namespace Lekman.Qualify;

/// <summary>A "not applicable" rule: tests it matches are skipped with its reason.</summary>
public sealed record NotApplicableRule
{
    /// <summary>Why the test does not apply. Recorded as the skip reason.</summary>
    public required string Reason { get; init; }

    /// <summary>The rule matches a test with any of these tags, or every test when null.</summary>
    public IReadOnlyList<string>? Tags { get; init; }

    /// <summary>The rule matches in any of these environments, or in every environment when null.</summary>
    public IReadOnlyList<string>? Environments { get; init; }
}

/// <summary>
/// Settings given in code, the C# counterpart of a runner's configuration
/// file. Environment variables win when both are set. Pass them to
/// <see cref="Qualification.Configure"/> before the first test runs, for
/// example from a module initializer in the test project.
/// </summary>
public sealed record QualifyOptions
{
    /// <summary>The environment name, used when <c>QUALIFY_ENVIRONMENT</c> is unset.</summary>
    public string? Environment { get; init; }

    /// <summary>
    /// Replaces the default environment lookup. If it throws or returns nothing,
    /// the environment is <c>production</c>.
    /// </summary>
    public Func<string?>? ResolveEnvironment { get; init; }

    /// <summary>Environment names treated as production, used when <c>QUALIFY_PRODUCTION</c> is unset.</summary>
    public IReadOnlyList<string>? Production { get; init; }

    /// <summary>Tests allowed to write in production, by ID with a reason, used when <c>QUALIFY_ALLOW_WRITE</c> is unset.</summary>
    public IReadOnlyDictionary<string, string>? AllowWrite { get; init; }

    /// <summary>Refuse every override, used when <c>QUALIFY_NO_OVERRIDES</c> is unset.</summary>
    public bool? NoOverrides { get; init; }

    /// <summary>The evidence directory, used when <c>QUALIFY_EVIDENCE_DIR</c> is unset.</summary>
    public string? EvidenceDir { get; init; }

    /// <summary>The attachment size limit in bytes, used when <c>QUALIFY_ATTACHMENT_LIMIT</c> is unset.</summary>
    public long? AttachmentLimit { get; init; }

    /// <summary>"Not applicable" rules.</summary>
    public IReadOnlyList<NotApplicableRule>? NotApplicable { get; init; }

    /// <summary>Reads a named secret. The default reads <c>QUALIFY_SECRET_&lt;NAME&gt;</c>.</summary>
    public Func<string, string?>? SecretSource { get; init; }
}
