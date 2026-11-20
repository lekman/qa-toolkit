namespace Lekman.Qualify.FilterSample;

public class ExportTests
{
    [IQ("IQ-EXPORT-001", "The export job is installed", Given = "a fresh install", When = "the installer finishes",
        Then = "the export job is registered", Tags = ["export"])]
    public void Installed() => QualifyContext.Current.Check("installer", "job registered").That(true).IsTrue();

    [OQ("OQ-EXPORT-003", "The bank file never changes an amount", Given = "a day of payments in three currencies",
        When = "the export writes the bank file", Then = "every amount in the file equals the amount in the ledger",
        Requirements = ["EXPORT-003"], Risk = Risk.High, Scope = Scope.Read, Tags = ["export", "slow"])]
    public void KeepsAmounts() => QualifyContext.Current.Check("bank file", "EUR keeps two decimals").That("100.50").IsEqualTo("100.50");

    [OQ("OQ-EXPORT-004", "The bank file lists every payment", Given = "a day of payments", When = "the export runs",
        Then = "the file has one line per payment", Scope = Scope.Read, Tags = ["export"])]
    public void ListsPayments() => QualifyContext.Current.Check("bank file", "three characters").That("abc").HasLength(3);
}

public class LedgerTests
{
    [PQ("PQ-LEDGER-001", "The ledger posts a day within a minute", Given = "a day of payments", When = "the ledger posts them",
        Then = "posting takes under a minute", Scope = Scope.Read, Tags = ["ledger", "slow"])]
    public void PostsQuickly() => QualifyContext.Current.Check("ledger", "seconds taken").That(12).IsAtMost(60);

    [IU("IU-LEDGER-001", "A clerk can close the day", Given = "an open day", When = "a clerk closes it",
        Then = "the day is closed", Tags = ["ledger"])]
    public void ClosesDay() => QualifyContext.Current.Check("ledger", "day closed").That("closed").IsEqualTo("closed");
}
