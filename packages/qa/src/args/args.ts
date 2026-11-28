import type { SetLevel } from "@lekman/test-sets";

import type { Parsed, RunCommand } from "./types";

const LEVELS: readonly string[] = [
  "unit",
  "story",
  "integration",
  "IQ",
  "OQ",
  "PQ",
  "IU",
];

/**
 * The qualify release `qa` runs by default. Pinned, so a new qualify release
 * cannot change what an existing `qa` does; `--qualify` picks another.
 */
const QUALIFY_VERSION = "0.2.0";

/** The default command for the qualify CLI. */
const QUALIFY = `npx --yes @lekman/qualify@${QUALIFY_VERSION}`;

/** The usage text. */
const USAGE = `qa: run the test sets in qa.yaml

  qa list [--json] [--config FILE]
  qa run [SET...] [--level LEVEL]... [--changed [--base REF]] [--report]
         [--dry-run] [--out DIR] [--qualify COMMAND] [--config FILE]

  qa list            the sets, and the package folders each one covers
  qa run             every set; name sets to run only those
  --level LEVEL      only sets of a level: unit, story, integration, IQ, OQ, PQ, IU
  --changed          only package folders with a change since --base (default
                     origin/main) or not yet committed
  --report           draw a PDF with \`qualify report\` for each qualification set
  --dry-run          print the commands, run nothing
  --out DIR          merged results and reports (default qa-results)
  --qualify COMMAND  how to run the qualify CLI (default ${QUALIFY})

Exit codes: 0 every set passed, 1 a set failed, 2 qa.yaml is invalid, 64 usage.`;

/** Reads the command line of `qa`. */
export class Args {
  /** The default command for the qualify CLI, with its pinned version. */
  static readonly QUALIFY = QUALIFY;

  /** The usage text, for `qa help` and usage errors. */
  static readonly USAGE = USAGE;

  /** What the arguments after `qa` ask for. */
  static parse(argv: readonly string[]): Parsed {
    const [first, ...rest] = argv;
    if (
      first === undefined ||
      first === "help" ||
      first === "--help" ||
      first === "-h"
    ) {
      return { kind: "help" };
    }
    if (first === "--version" || first === "-v") return { kind: "version" };
    if (first === "list") {
      let json = false;
      let config: string | undefined;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i] as string;
        if (a === "--json") json = true;
        else if (a === "--config" && rest[i + 1] !== undefined)
          config = rest[++i];
        else return { error: `qa list does not take ${a}`, kind: "usage" };
      }
      return {
        json,
        kind: "list",
        ...(config === undefined ? {} : { config }),
      };
    }
    if (first === "run") return Args.run(rest);
    return { error: `unknown command ${first}`, kind: "usage" };
  }

  private static run(rest: readonly string[]): Parsed {
    const command: RunCommand = {
      changed: false,
      dryRun: false,
      kind: "run",
      levels: [],
      names: [],
      out: "qa-results",
      qualify: QUALIFY,
      report: false,
    };
    const takes = new Set([
      "--base",
      "--config",
      "--level",
      "--out",
      "--qualify",
    ]);
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i] as string;
      if (takes.has(a)) {
        const value = rest[++i];
        if (value === undefined || value.startsWith("--")) {
          return { error: `${a} needs a value`, kind: "usage" };
        }
        if (a === "--level") {
          if (!LEVELS.includes(value)) {
            return {
              error: `--level ${value} is not one of ${LEVELS.join(", ")}`,
              kind: "usage",
            };
          }
          command.levels.push(value as SetLevel);
        } else if (a === "--base") command.base = value;
        else if (a === "--config") command.config = value;
        else if (a === "--out") command.out = value;
        else command.qualify = value;
      } else if (a === "--changed") command.changed = true;
      else if (a === "--dry-run") command.dryRun = true;
      else if (a === "--report") command.report = true;
      else if (a.startsWith("-"))
        return { error: `qa run does not take ${a}`, kind: "usage" };
      else command.names.push(a);
    }
    if (command.base !== undefined && !command.changed) {
      return { error: "--base needs --changed", kind: "usage" };
    }
    return command;
  }
}
