/** The test framework a runner runs, which discovery reads declarations for. */
export type Framework =
  | "bun"
  | "cucumber"
  | "junit"
  | "node"
  | "playwright"
  | "pytest"
  | "storybook"
  | "vitest"
  | "xunit";

/** What `${tool}` becomes when a file is found at or above the package. */
export interface ToolChoice {
  /** The file to look for; the entry always applies when it is left out. */
  file?: string;
  /** The value; `${dir}` is the path from the package to the file's folder. */
  value: string;
}

/** How `${filter}` selects tests with the runner's own filter. */
export interface Selection {
  /** The argument, from `${terms}`, or from `${term}` when `repeat` is set. */
  argument: string;
  join: string;
  quote: "all" | "each" | "none";
  repeat?: boolean;
  /** One test, from `${id}`, `${class}` and `${method}`. */
  term: string;
}

/** How a runner writes JUnit XML, and where the XML lands. */
export interface JunitOutput {
  /** Arguments added to the command so it writes JUnit XML to `${junitFile}`. */
  args?: string;
  /** Environment variables that make it write JUnit XML. */
  env?: Record<string, string>;
  /** Relative to the package folder: `${junitFile}`, or a glob when the runner names its own files. */
  file: string;
  /** What the project must install first, if anything. */
  requires?: string;
}

/**
 * A runner, as data: which files hold its tests, how to run a selection of
 * them, and how it leaves results. The files in `runners/` follow
 * `runners/runner.schema.json`.
 */
export interface RunnerDefinition {
  command: string;
  files: string[];
  framework: Framework;
  id: string;
  junit: JunitOutput;
  label: string;
  packageMarkers?: string[];
  /** Whether the framework has a qualify adapter that writes qualify evidence. */
  qualify?: boolean;
  select: Selection;
  tools: ToolChoice[];
}

/** The parts of a test that a selection term may use. */
export interface SelectedTest {
  className?: string;
  id: string;
  method?: string;
}
