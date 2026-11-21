using Xunit;

namespace Lekman.Qualify.Conformance.Harness;

/// <summary>
/// Proves that <c>dotnet test</c> selects qualification tests by level, by tag
/// and by ID under the Microsoft Testing Platform, both with xUnit's own
/// filters and with the VSTest filter syntax it accepts. Each run's records
/// show which tests ran.
/// </summary>
public class FilterTests
{
    [Theory]
    [InlineData(new[] { "--filter-trait", "Qualify=OQ" }, new[] { "OQ-EXPORT-003", "OQ-EXPORT-004" })]
    [InlineData(new[] { "--filter-trait", "Tag=slow" }, new[] { "OQ-EXPORT-003", "PQ-LEDGER-001" })]
    [InlineData(new[] { "--filter-trait", "Qualify=IU", "--filter-trait", "Qualify=IQ" }, new[] { "IQ-EXPORT-001", "IU-LEDGER-001" })]
    [InlineData(new[] { "--filter-not-trait", "Tag=export" }, new[] { "IU-LEDGER-001", "PQ-LEDGER-001" })]
    [InlineData(new[] { "--filter-display-name", "[OQ-EXPORT-003]*" }, new[] { "OQ-EXPORT-003" })]
    [InlineData(new[] { "--filter", "Qualify=PQ" }, new[] { "PQ-LEDGER-001" })]
    [InlineData(new[] { "--filter", "Tag=ledger&Qualify!=PQ" }, new[] { "IU-LEDGER-001" })]
    [InlineData(new[] { "--filter", "DisplayName~IQ-EXPORT-001" }, new[] { "IQ-EXPORT-001" })]
    public void DotnetTestSelectsByLevelTagAndId(string[] filter, string[] expected)
    {
        var dir = Harness.NewDirectory("filter");
        try
        {
            var result = Harness.DotnetTest("Lekman.Qualify.FilterSample", dir, filter);
            Assert.True(result.Status == 0, $"dotnet test exited {result.Status}\n{result.Output}");
            var ran = Harness.Records(dir)
                .Where(name => name.EndsWith(".json", StringComparison.Ordinal))
                .Select(name => name.Split("__")[1])
                .Order(StringComparer.Ordinal);
            Assert.Equal(expected, ran);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
