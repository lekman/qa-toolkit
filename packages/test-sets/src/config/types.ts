/** A level in the tree: an ordinary level, or a qualification level from qualify. */
export type SetLevel =
  "integration" | "IQ" | "IU" | "OQ" | "PQ" | "story" | "unit";

/** The result format a set's results are read from. */
export type ResultFormat = "junit-xml" | "qualify-evidence";

/** One test set: tests of one level, run by one runner, in some package folders. */
export interface TestSet {
  /** The command for the set; the runner definition's command when left out. */
  command?: string;
  /** Environment variables for the command. */
  env?: Record<string, string>;
  /** Globs of test files inside each package; the runner's globs when left out. */
  files?: string[];
  level: SetLevel;
  /** Unique in the file. */
  name: string;
  /** Package folders, or globs of them, relative to the repository root. */
  paths: string[];
  /** Where results land, relative to the package folder. */
  results?: string;
  /** A runner definition ID. */
  runner: string;
}

/** The content of `qa.yaml`. */
export interface TestSetFile {
  sets: TestSet[];
  version: 1;
}

/** What reading `qa.yaml` gave: the sets, or the problems that stop them being used. */
export interface ParsedTestSets {
  file?: TestSetFile;
  /** Each problem with the path in the file where it is, such as `/sets/0/level`. */
  problems: string[];
}

/** Which sets to use. Every set when a field is left out. */
export interface SetFilter {
  levels?: readonly SetLevel[];
  names?: readonly string[];
}
