import type { SetLevel } from "@lekman/test-sets";

/** `qa list`: the sets and the folders each covers. */
export interface ListCommand {
  config?: string;
  json: boolean;
  kind: "list";
}

/** `qa run`: run some or all sets. */
export interface RunCommand {
  /** The ref `--changed` compares with; `origin/main` when left out. */
  base?: string;
  /** Only the package folders with a change since `base`, or uncommitted. */
  changed: boolean;
  config?: string;
  /** Print the commands without running them. */
  dryRun: boolean;
  kind: "run";
  levels: SetLevel[];
  names: string[];
  /** The folder for merged results and reports, relative to the repository root. */
  out: string;
  /** The command that runs the qualify CLI. */
  qualify: string;
  /** Draw a PDF report for each qualification set with `qualify report`. */
  report: boolean;
}

/** `qa help` or `qa --version`. */
export interface InfoCommand {
  kind: "help" | "version";
}

/** A command line read into what to do, or why it cannot be read. */
export type Parsed =
  InfoCommand | ListCommand | RunCommand | { error: string; kind: "usage" };
