/** How one test case ended in a JUnit XML report. */
export type CaseOutcome = "error" | "fail" | "pass" | "skip";

/** One `<testcase>` of a JUnit XML report. */
export interface JunitCase {
  classname?: string;
  /** The `file` attribute, which some runners write. */
  file?: string;
  /** The `line` attribute, which some runners write. */
  line?: number;
  /** The failure, error or skip message, when there is one. */
  message?: string;
  name: string;
  outcome: CaseOutcome;
  /** The name of the `<testsuite>` that holds it. */
  suite: string;
  /** Seconds. */
  time?: number;
}

/** Counts over a set of test cases. */
export interface JunitSummary {
  errors: number;
  failures: number;
  skipped: number;
  tests: number;
  /** Seconds. */
  time: number;
}
