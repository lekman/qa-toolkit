import type {
  FileIndex,
  ResultFormat,
  RunnerDefinition,
  SetFilter,
  TestSet,
  TestSetFile,
} from "@lekman/test-sets";

/** One command: a set in one package folder. */
export interface PlannedRun {
  command: string;
  /** Absolute path the command runs in. */
  cwd: string;
  /** Variables added to the environment. */
  env: Record<string, string>;
  /** Relative to the repository root, `.` for the root. */
  folder: string;
  format: ResultFormat;
  /**
   * Absolute path of the results: the evidence folder for qualify evidence,
   * the JUnit XML file, or a glob of files when the runner names its own.
   */
  results: string;
  runner: RunnerDefinition;
  set: TestSet;
  /** The folder as one path segment, for file names. */
  slug: string;
}

/** What a plan is built from. */
export interface PlanInput {
  /** Files changed since the base, relative to the root; every folder runs when left out. */
  changed?: readonly string[];
  file: TestSetFile;
  filter: SetFilter;
  /** Every folder of the repository, relative to the root, `.` for the root. */
  folders: readonly string[];
  /** File names by absolute folder, for `${tool}`. */
  index: FileIndex;
  /** Absolute path of the output folder. */
  out: string;
  platform: string;
  /** Absolute path of the repository root. */
  root: string;
  runId: string;
}

/** The commands to run, and what stops a set from running. */
export interface PlanResult {
  problems: string[];
  runs: PlannedRun[];
}
