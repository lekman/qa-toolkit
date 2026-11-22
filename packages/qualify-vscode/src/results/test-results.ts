import type {
  Outcome,
  RecordedCheck,
  ResultMessage,
  RunWindow,
  TestRecord,
  TestResult,
} from "./types";

/** Which outcome wins when one test left several records, such as one per viewport. */
const RANK: Readonly<Record<Outcome, number>> = {
  error: 2,
  fail: 3,
  pass: 1,
  skip: 0,
};

const json = (value: unknown): string => {
  const out = JSON.stringify(value, null, 2);
  return out === undefined ? "undefined" : out;
};

/** The message for a failed check. */
const checkMessage = (check: RecordedCheck, prefix: string): ResultMessage => ({
  actual: json(check.actual),
  expected: json(check.expected),
  text: `${prefix}${check.soft ? "Soft check" : "Check"} failed: ${check.context}: ${check.description} (${check.matcher})${check.site ? ` at ${check.site}` : ""}`,
});

/** Turns the records a run wrote into one result per test. */
export class TestResults {
  /**
   * The result of one test from the records of a run. Records with the run's
   * ID win; without any, records that ended after the run started count,
   * for a command that sets its own run ID. With several records, the worst
   * outcome wins: fail, then error, then pass, then skip.
   */
  static forTest(
    id: string,
    records: readonly TestRecord[],
    window: RunWindow,
    notRunReason: string,
  ): TestResult {
    const mine = TestResults.select(id, records, window);
    if (mine.length === 0) {
      return {
        messages: [],
        outcome: "not-run",
        output: [`${id}: not run. ${notRunReason}`],
      };
    }
    const outcome = mine
      .map((r) => r.outcome)
      .reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    const several = mine.length > 1;
    const messages: ResultMessage[] = [];
    const output: string[] = [];
    for (const record of mine) {
      const prefix = several ? `[${record.path}] ` : "";
      output.push(`${id}: ${record.outcome}, evidence ${record.path}`);
      if (record.outcome === "skip" && record.skipReason !== undefined) {
        output.push(`${id}: skipped: ${record.skipReason}`);
      }
      const failed = record.checks.filter((c) => !c.pass);
      messages.push(...failed.map((c) => checkMessage(c, prefix)));
      const error = record.error;
      if (
        error !== undefined &&
        (error.type !== "CheckFailed" || failed.length === 0)
      ) {
        messages.push({
          text: `${prefix}${error.type}: ${error.message}${error.site ? ` at ${error.site}` : ""}`,
        });
      }
    }
    if (messages.length > 0) {
      messages.push({
        text: `Evidence: ${mine.map((r) => r.path).join(", ")}`,
      });
    }
    const durations = mine.flatMap((r) =>
      r.durationMs === undefined ? [] : [r.durationMs],
    );
    return {
      messages,
      outcome,
      output,
      ...(durations.length > 0 ? { durationMs: Math.max(...durations) } : {}),
    };
  }

  /**
   * The records of one test that belong to the run, without the copy a run
   * file holds of a record file that was also read.
   */
  static select(
    id: string,
    records: readonly TestRecord[],
    window: RunWindow,
  ): TestRecord[] {
    const own = records.filter((r) => r.id === id);
    const byRun = own.filter((r) => r.runId === window.runId);
    const chosen =
      byRun.length > 0
        ? byRun
        : own.filter(
            (r) => r.endedAt !== undefined && r.endedAt >= window.since,
          );
    const seen = new Set<string>();
    return chosen
      .slice()
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .filter((r) => {
        const key = `${r.runId}|${r.id}|${r.site ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
}
