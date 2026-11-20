using Lekman.Qualify.Declarations;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Execution;
using Xunit.Sdk;
using Xunit.v3;

namespace Lekman.Qualify.Runner;

/// <summary>
/// Discovers a qualification test. A valid declaration becomes a
/// <see cref="QualifyTestCase"/> with the traits <c>Qualify</c> (the level)
/// and <c>Tag</c> (each tag); the display name <c>[&lt;ID&gt;] &lt;title&gt;</c>
/// selects by ID. An invalid
/// declaration becomes a test that fails with the declaration error and
/// writes no evidence.
/// </summary>
public sealed class QualifyDiscoverer : IXunitTestCaseDiscoverer
{
    /// <summary>The trait that holds the level.</summary>
    public const string LevelTrait = "Qualify";

    /// <summary>The trait that holds each tag.</summary>
    public const string TagTrait = "Tag";

    /// <inheritdoc />
    public ValueTask<IReadOnlyCollection<IXunitTestCase>> Discover(
        ITestFrameworkDiscoveryOptions discoveryOptions,
        IXunitTestMethod testMethod,
        IFactAttribute factAttribute)
    {
        ArgumentNullException.ThrowIfNull(discoveryOptions);
        ArgumentNullException.ThrowIfNull(testMethod);
        ArgumentNullException.ThrowIfNull(factAttribute);

        var attribute = (QualifyAttribute)factAttribute;
        var details = TestIntrospectionHelper.GetTestCaseDetails(discoveryOptions, testMethod, factAttribute);

        string? problem = null;
        Declaration? declaration = null;
        if (testMethod.Parameters.Count != 0)
        {
            problem = $"qualify declaration {attribute.Id}: qualification tests take no parameters, because one ID cannot map to several records; read the context from QualifyContext.Current";
        }
        else if (testMethod.IsGenericMethodDefinition)
        {
            problem = $"qualify declaration {attribute.Id}: qualification tests must not be generic";
        }
        else
        {
            try
            {
                declaration = Declare(attribute);
            }
            catch (DeclarationException error)
            {
                problem = error.Message;
            }
        }

        if (problem is not null)
        {
            IXunitTestCase failing = new ExecutionErrorTestCase(
                details.ResolvedTestMethod,
                details.TestCaseDisplayName,
                details.UniqueID,
                details.SourceFilePath,
                details.SourceLineNumber,
                problem);
            return new([failing]);
        }

        var traits = testMethod.Traits.ToDictionary(
            pair => pair.Key,
            pair => new HashSet<string>(pair.Value, StringComparer.OrdinalIgnoreCase),
            StringComparer.OrdinalIgnoreCase);
        Add(traits, LevelTrait, declaration!.Level);
        foreach (var tag in declaration.Tags)
        {
            Add(traits, TagTrait, tag);
        }

        IXunitTestCase testCase = new QualifyTestCase(
            details.ResolvedTestMethod,
            details.TestCaseDisplayName,
            details.UniqueID,
            details.Explicit,
            details.SkipExceptions,
            details.SkipReason,
            details.SkipType,
            details.SkipUnless,
            details.SkipWhen,
            traits,
            details.SourceFilePath,
            details.SourceLineNumber,
            details.Timeout);
        return new([testCase]);
    }

    /// <summary>Validate the attribute's declaration with its site.</summary>
    internal static Declaration Declare(QualifyAttribute attribute) =>
        DeclarationRules.Validate(
            attribute.ToInput(),
            Sites.Format(attribute.SourceFilePath, attribute.SourceLineNumber ?? 0, QualifyRuntime.SiteRoot()));

    private static void Add(Dictionary<string, HashSet<string>> traits, string name, string value)
    {
        if (!traits.TryGetValue(name, out var values))
        {
            values = [with(StringComparer.OrdinalIgnoreCase)];
            traits[name] = values;
        }

        values.Add(value);
    }
}
