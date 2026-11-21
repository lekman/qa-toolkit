using Xunit.v3;

namespace Lekman.Qualify.Execution;

/// <summary>How a body ended, as section 3.3 of the specification classifies it.</summary>
public sealed record Classification(string Outcome, string? SkipReason = null, string? FailureType = null, string? FailureMessage = null);

/// <summary>Outcome classification, section 3.3 of the specification.</summary>
public static class Outcomes
{
    /// <summary>
    /// Classify the end of a body: what it threw, if anything, and how many
    /// soft checks failed. A thrown exception decides the outcome; failed soft
    /// checks decide it only when the body completed.
    /// </summary>
    public static Classification Classify(Exception? thrown, int softFailures)
    {
        if (thrown is null)
        {
            return softFailures > 0
                ? new("fail", FailureType: "CheckFailed", FailureMessage: $"{softFailures} soft check(s) failed")
                : new("pass");
        }

        if (thrown is SkipException signal)
        {
            return new("skip", SkipReason: signal.Reason);
        }

        if (thrown.Message.StartsWith(DynamicSkipToken.Value, StringComparison.Ordinal))
        {
            return new("skip", SkipReason: thrown.Message[DynamicSkipToken.Value.Length..]);
        }

        if (thrown is CheckFailedException)
        {
            return new("fail", FailureType: "CheckFailed", FailureMessage: thrown.Message);
        }

        return IsAssertion(thrown)
            ? new("fail", FailureType: TypeName(thrown), FailureMessage: thrown.Message)
            : new("error", FailureType: TypeName(thrown), FailureMessage: thrown.Message);
    }

    /// <summary>
    /// Whether an exception is the language's own assertion error: xUnit's
    /// <c>XunitException</c> family, anything marked with an interface named
    /// <c>IAssertionException</c> (as xUnit reads it), and a failed
    /// <c>System.Diagnostics.Debug</c> assertion, which xUnit raises as
    /// <c>TraceAssertException</c>.
    /// </summary>
    public static bool IsAssertion(Exception exception)
    {
        var type = exception.GetType();
        if (type.GetInterfaces().Any(face => face.Name == "IAssertionException"))
        {
            return true;
        }

        for (var current = type; current is not null; current = current.BaseType)
        {
            if (current.FullName is "Xunit.Sdk.XunitException" or "Xunit.Sdk.TraceAssertException")
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>The type name recorded for an exception: its simple name.</summary>
    public static string TypeName(Exception exception) => exception switch
    {
        RedactedException redacted => redacted.TypeName,
        CheckFailedException => "CheckFailed",
        AttachmentTooLargeException => "AttachmentTooLarge",
        SecretNotFoundException => "SecretNotFound",
        _ => exception.GetType().Name,
    };
}
