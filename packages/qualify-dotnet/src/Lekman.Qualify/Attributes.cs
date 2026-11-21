using System.Runtime.CompilerServices;
using Lekman.Qualify.Runner;
using Xunit;
using Xunit.v3;

namespace Lekman.Qualify;

/// <summary>The risk a test addresses.</summary>
public enum Risk
{
    /// <summary>No risk declared.</summary>
    NotSet = 0,

    /// <summary><c>high</c></summary>
    High,

    /// <summary><c>medium</c></summary>
    Medium,

    /// <summary><c>low</c></summary>
    Low,
}

/// <summary>The declared effect of a test on the system under test.</summary>
public enum Scope
{
    /// <summary>No scope declared. OQ and PQ tests must declare one.</summary>
    NotSet = 0,

    /// <summary><c>read</c>: the test does not change the system.</summary>
    Read,

    /// <summary><c>read-write</c>: the test changes the system, so it is blocked in production.</summary>
    ReadWrite,
}

/// <summary>
/// A qualification test: an xUnit fact with an ID, a narrative and recorded
/// checks. qualify runs the method body itself, writes a started marker
/// before it and a redacted record after it. The display name is
/// <c>[&lt;ID&gt;] &lt;title&gt;</c>, and the test carries the traits
/// <c>Qualify</c> (the level) and <c>Tag</c> (each tag).
/// Use <see cref="IQAttribute"/>, <see cref="OQAttribute"/>,
/// <see cref="PQAttribute"/> or <see cref="IUAttribute"/>.
/// </summary>
[XunitTestCaseDiscoverer(typeof(QualifyDiscoverer))]
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public abstract class QualifyAttribute : FactAttribute
{
    private protected QualifyAttribute(string level, string id, string title, string? sourceFilePath, int sourceLineNumber)
        : base(sourceFilePath, sourceLineNumber)
    {
        Level = level;
        Id = id;
        Title = title;
        DisplayName = Declarations.DeclarationRules.DisplayName(id, title);
    }

    /// <summary>IQ, OQ, PQ or IU.</summary>
    public string Level { get; }

    /// <summary>The test ID, for example <c>OQ-EXPORT-003</c>.</summary>
    public string Id { get; }

    /// <summary>One line that says what the test shows.</summary>
    public string Title { get; }

    /// <summary>The starting state. Required.</summary>
    public string? Given { get; set; }

    /// <summary>The action. Required.</summary>
    public string? When { get; set; }

    /// <summary>The expected result. Required.</summary>
    public string? Then { get; set; }

    /// <summary>Further clauses, each not empty.</summary>
    public string[]? And { get; set; }

    /// <summary>Requirement IDs, 1 to 64 characters each, without duplicates.</summary>
    public string[]? Requirements { get; set; }

    /// <summary>The risk the test addresses.</summary>
    public Risk Risk { get; set; }

    /// <summary>Free tags. Stored sorted and without duplicates.</summary>
    public string[]? Tags { get; set; }

    /// <summary>The ID of the negative test this test is the control for.</summary>
    public string? Controls { get; set; }

    /// <summary>The scope. Required for OQ and PQ; IQ is always read and IU always read-write.</summary>
    public Scope Scope { get; set; }

    internal Declarations.DeclarationInput ToInput() => new()
    {
        Level = Level,
        Id = Id,
        Title = Title,
        Given = Given,
        When = When,
        Then = Then,
        And = And,
        Scope = Scope,
        Requirements = Requirements,
        Risk = Risk,
        Tags = Tags,
        Controls = Controls,
    };
}

/// <summary>An Installation Qualification test. Its scope is always <c>read</c>.</summary>
[XunitTestCaseDiscoverer(typeof(QualifyDiscoverer))]
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class IQAttribute : QualifyAttribute
{
    /// <summary>Declare an IQ test.</summary>
    public IQAttribute(string id, string title, [CallerFilePath] string? sourceFilePath = null, [CallerLineNumber] int sourceLineNumber = -1)
        : base("IQ", id, title, sourceFilePath, sourceLineNumber)
    {
    }
}

/// <summary>An Operational Qualification test. Declare its <see cref="QualifyAttribute.Scope"/>.</summary>
[XunitTestCaseDiscoverer(typeof(QualifyDiscoverer))]
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class OQAttribute : QualifyAttribute
{
    /// <summary>Declare an OQ test.</summary>
    public OQAttribute(string id, string title, [CallerFilePath] string? sourceFilePath = null, [CallerLineNumber] int sourceLineNumber = -1)
        : base("OQ", id, title, sourceFilePath, sourceLineNumber)
    {
    }
}

/// <summary>A Performance Qualification test. Declare its <see cref="QualifyAttribute.Scope"/>.</summary>
[XunitTestCaseDiscoverer(typeof(QualifyDiscoverer))]
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class PQAttribute : QualifyAttribute
{
    /// <summary>Declare a PQ test.</summary>
    public PQAttribute(string id, string title, [CallerFilePath] string? sourceFilePath = null, [CallerLineNumber] int sourceLineNumber = -1)
        : base("PQ", id, title, sourceFilePath, sourceLineNumber)
    {
    }
}

/// <summary>An Intended Use test. Its scope is always <c>read-write</c>.</summary>
[XunitTestCaseDiscoverer(typeof(QualifyDiscoverer))]
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class IUAttribute : QualifyAttribute
{
    /// <summary>Declare an IU test.</summary>
    public IUAttribute(string id, string title, [CallerFilePath] string? sourceFilePath = null, [CallerLineNumber] int sourceLineNumber = -1)
        : base("IU", id, title, sourceFilePath, sourceLineNumber)
    {
    }
}
