using Xunit.v3;

namespace Lekman.Qualify;

/// <summary>
/// Marks an exception as an assertion failure. xUnit and qualify both read the
/// interface by its name, so the outcome is <c>fail</c> and the runner reports
/// an assertion rather than an error.
/// </summary>
internal interface IAssertionException
{
}

/// <summary>
/// A failed check: thrown by a hard check at once, and at the end of the body
/// when a soft check failed. The outcome is <c>fail</c>.
/// </summary>
public sealed class CheckFailedException : Exception, IAssertionException
{
    /// <summary>Create the failure with its message and the site of the failing check.</summary>
    public CheckFailedException(string message, string site)
        : base(message)
    {
        Site = site;
    }

    /// <summary>The <c>path:line</c> of the failing check.</summary>
    public string Site { get; }
}

/// <summary>An attachment over the size limit. The outcome is <c>error</c>.</summary>
public sealed class AttachmentTooLargeException(string message) : Exception(message);

/// <summary><see cref="QualifyContext.Secret"/> found no value for the name. The outcome is <c>error</c>.</summary>
public sealed class SecretNotFoundException(string message) : Exception(message);

/// <summary>
/// Thrown by <see cref="QualifyContext.Skip"/> to end the body. Its message
/// starts with xUnit's dynamic skip token, so xUnit reports the test as
/// skipped. The outcome is <c>skip</c>.
/// </summary>
public sealed class SkipException : Exception
{
    /// <summary>Skip with a reason.</summary>
    public SkipException(string reason)
        : base(DynamicSkipToken.Value + reason)
    {
        Reason = reason;
    }

    /// <summary>Why the test was skipped.</summary>
    public string Reason { get; }
}

/// <summary>
/// Stands in for an exception whose message or stack trace held a registered
/// secret, so the runner's own output never shows it. Keeps the original type
/// name and, for assertion failures, the assertion marker.
/// </summary>
internal class RedactedException(string typeName, string message, string? stackTrace) : Exception(message)
{
    /// <summary>The name of the type it replaces.</summary>
    public string TypeName { get; } = typeName;

    /// <inheritdoc />
    public override string? StackTrace { get; } = stackTrace;

    /// <inheritdoc />
    public override string ToString() => $"{TypeName}: {Message}{Environment.NewLine}{StackTrace}";
}

/// <summary>A redacted assertion failure.</summary>
internal sealed class RedactedAssertion(string typeName, string message, string? stackTrace)
    : RedactedException(typeName, message, stackTrace), IAssertionException;
