import type { RunFile, RunInfo } from "../evidence";

/** One file read from `<evidenceDir>/records/`. */
export interface MergeInput {
  name: string;
  text: string;
}

/** What merge needs besides the files. */
export interface MergeOptions {
  /** Other run IDs that may be merged in (`--allow-runs`). */
  allowRuns: readonly string[];
  /** The envelope for a run file with no records at all. */
  emptyEnvelope: () => RunInfo;
  /** The current time, for a run file with no records. */
  now: () => Date;
}

/** The result of a merge: a run file and its exit code, or the input errors. */
export type MergeResult =
  | { errors: string[]; exitCode: 2; ok: false }
  | { exitCode: 0 | 1 | 3; file: RunFile; ok: true };
