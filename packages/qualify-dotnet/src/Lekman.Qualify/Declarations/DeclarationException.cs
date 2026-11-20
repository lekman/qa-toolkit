namespace Lekman.Qualify.Declarations;

/// <summary>
/// A test declared with missing or invalid fields. It fails the test at
/// discovery and no evidence is written for it.
/// </summary>
public sealed class DeclarationException : Exception
{
    /// <summary>Create the error for a test ID and its problems.</summary>
    public DeclarationException(string testId, IReadOnlyList<string> problems)
        : base($"qualify declaration {testId}: {string.Join("; ", problems)}")
    {
        TestId = testId;
        Problems = problems;
    }

    /// <summary>The ID as written, which may itself be the problem.</summary>
    public string TestId { get; }

    /// <summary>Each problem found, in the order the fields were checked.</summary>
    public IReadOnlyList<string> Problems { get; }
}
