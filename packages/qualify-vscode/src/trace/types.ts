import type { QualifySettings } from "../settings";

/** A workspace folder, with what the trace command needs to know of it. */
export interface TraceFolder {
  name: string;
  /** Absolute path. */
  path: string;
  settings: QualifySettings;
}

/** A folder where a package's tests write evidence. */
export interface EvidenceLocation {
  /** The evidence folder, relative to the package. */
  dir: string;
  /** The package folder relative to the workspace folder: `.`, a path, a glob of paths, or `**` for every package. */
  package: string;
}

/** A qualification run that a trace matrix can be built from. */
export interface EvidenceRun {
  /** Absolute path of the evidence folder. */
  dir: string;
  /** The run file, for a run that `qualify merge` has merged. */
  file?: string;
  folder: TraceFolder;
  /** The qualification levels of its tests, in level order. */
  levels: string[];
  /** The package folder, relative to the workspace folder. */
  package: string;
  /** The record files of a run that is not merged yet. */
  records?: string[];
  /** Whether the evidence folder also holds records of other runs. */
  recordsOfOtherRuns?: boolean;
  runId: string;
  /** When the run started, in milliseconds since the epoch. */
  startedMs: number;
  tests: number;
  /** The `@lekman/qualify` version that wrote the run, when it says. */
  toolVersion?: string;
  verdict?: string;
}

/** One entry of a quick-pick list. */
export interface PickItem<T> {
  description?: string;
  detail?: string;
  label: string;
  value: T;
}

/** How a command ended, and what it printed. */
export interface ExecResult {
  /** The exit code, or `null` when it was stopped or did not start. */
  code: null | number;
  output: string;
}

/** What was found about the qualify CLI between a run's folder and its workspace folder. */
export interface CliFacts {
  /** The `qualify` the workspace installed, `node_modules/.bin/qualify`. */
  bin?: string;
  /** Whether a folder on the way up has a Bun lockfile. */
  bun: boolean;
  /** The version a `package.json` on the way up pins, or the one that wrote the run. */
  version?: string;
}
