/** How a test ended, as the evidence records it. */
export type Outcome = "error" | "fail" | "pass" | "skip";

/** One recorded check, with values already redacted by the process that ran the test. */
export interface RecordedCheck {
  actual: unknown;
  context: string;
  description: string;
  expected: unknown;
  matcher: string;
  pass: boolean;
  /** `path:line`, relative to the repository. */
  site?: string;
  soft: boolean;
}

/** One test's result, read from an evidence record or a run file. */
export interface TestRecord {
  checks: RecordedCheck[];
  durationMs?: number;
  endedAt?: string;
  error?: { message: string; site?: null | string; type: string };
  id: string;
  outcome: Outcome;
  /** Absolute path of the file it was read from. */
  path: string;
  runId: string;
  /** The declaration's site, `path:line`. */
  site?: string;
  skipReason?: string;
}

/** A message to show at the test's declaration. */
export interface ResultMessage {
  /** The actual value as JSON, for a failed check. */
  actual?: string;
  /** The expected value as JSON, for a failed check. */
  expected?: string;
  text: string;
}

/** What a run left for one test. `not-run` when it left no record. */
export interface TestResult {
  durationMs?: number;
  messages: ResultMessage[];
  outcome: "not-run" | Outcome;
  /** Lines for the test's output: the record paths, a skip reason, or why it did not run. */
  output: string[];
}

/** Which records belong to a run. */
export interface RunWindow {
  /** The run ID the run was given in `QUALIFY_RUN_ID`. */
  runId: string;
  /** When the run started, as an ISO timestamp; a record that ended before it is older. */
  since: string;
}
