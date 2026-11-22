import type { Framework } from "../discovery";

/** A result format a runner leaves behind. */
export type ResultFormat = "junit-xml" | "qualify-evidence";

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

/**
 * A runner, as data: which files declare its tests, how to run a selection
 * of them, and the format of the results. The files in `runners/` follow
 * `runners/runner.schema.json`.
 */
export interface RunnerDefinition {
  command: string;
  files: string[];
  framework: Framework;
  id: string;
  label: string;
  packageMarkers?: string[];
  results: ResultFormat;
  select: Selection;
  tools: ToolChoice[];
}

/** The parts of a test that a selection term may use. */
export interface SelectedTest {
  className?: string;
  id: string;
  method?: string;
}
