import type { JunitSummary } from "@lekman/test-sets";

/** How one set ended in one folder. */
export type RunStatus = "fail" | "not-run" | "pass";

/** The result of one set in one folder. */
export interface SetResult {
  durationMs: number;
  /** The command's exit code; `null` when it did not run. */
  exitCode: null | number;
  folder: string;
  /** Why the result is what it is, when the counts do not say it. */
  note?: string;
  /** The PDF `qualify report` drew, when `--report` was given. */
  report?: string;
  /** The files the result was read from. */
  results: string[];
  set: string;
  status: RunStatus;
  summary: JunitSummary;
}

/** What `qa run` did. */
export interface RunOutcome {
  exitCode: number;
  results: SetResult[];
}

/** The counts of a qualify run file's `summary`. */
export interface QualifySummary {
  error: number;
  fail: number;
  pass: number;
  skip: number;
  total: number;
  verdict: string;
}

/** Options of `qa run` that change how a plan runs. */
export interface RunOptions {
  dryRun: boolean;
  /** Absolute path of the output folder. */
  out: string;
  platform: string;
  qualify: string;
  report: boolean;
  /** Absolute path of the repository root. */
  root: string;
}
