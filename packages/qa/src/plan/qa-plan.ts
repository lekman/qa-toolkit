import type { RunnerDefinition, TestSet } from "@lekman/test-sets";

import { CommandLines, RunnerDefinitions, TestSets } from "@lekman/test-sets";
import { basename, dirname, join } from "node:path";

import type { PlanInput, PlannedRun, PlanResult } from "./types";

/** The folder as one path segment, for file names. */
const slugOf = (folder: string): string =>
  folder === "." ? "root" : folder.replace(/[/\\]/g, "-");

/** Fills placeholders in every value of a record. */
const fillAll = (
  values: Readonly<Record<string, string>> | undefined,
  with_: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(values ?? {}).map(([k, v]) => [
      k,
      CommandLines.fill(v, with_),
    ]),
  );

/**
 * Turns the sets of `qa.yaml` into commands: one per set and package
 * folder, with the runner's command or the set's own, and the arguments and
 * variables that make it leave results where the CLI reads them.
 */
export class QaPlan {
  /** The plan for the selected sets. */
  static build(input: PlanInput): PlanResult {
    const selected = TestSets.select(input.file, input.filter);
    const problems = [...selected.problems];
    const runs: PlannedRun[] = [];
    for (const set of selected.sets) {
      const runner = RunnerDefinitions.byId(set.runner);
      if (runner === undefined) {
        problems.push(`set ${set.name}: no runner is named ${set.runner}`);
        continue;
      }
      const folders = QaPlan.folders(set, input.folders);
      if (folders.length === 0) {
        problems.push(
          `set ${set.name}: no folder matches ${set.paths.join(", ")}`,
        );
        continue;
      }
      for (const folder of folders) {
        if (
          input.changed !== undefined &&
          !QaPlan.touched(folder, input.changed)
        )
          continue;
        runs.push(QaPlan.run(set, runner, folder, input));
      }
    }
    return { problems, runs };
  }

  /** The folders of the repository a set covers, in order. */
  static folders(set: TestSet, folders: readonly string[]): string[] {
    return folders.filter((f) => TestSets.covers(set, f));
  }

  /** Whether a changed file is in the folder; any change touches the root. */
  static touched(folder: string, changed: readonly string[]): boolean {
    if (folder === ".") return changed.length > 0;
    return changed.some(
      (file) => file === folder || file.startsWith(`${folder}/`),
    );
  }

  /**
   * Where a run's results land. Without `results` in the set, the CLI's own
   * output folder holds them, so nothing from an earlier run is read; a
   * runner that names its own JUnit files is read where it writes them.
   */
  private static results(
    set: TestSet,
    runner: RunnerDefinition,
    cwd: string,
    slug: string,
    out: string,
  ): string {
    if (TestSets.resultFormat(set) === "qualify-evidence") {
      return set.results === undefined
        ? join(out, "evidence", set.name, slug)
        : join(cwd, set.results);
    }
    if (set.results !== undefined) {
      return set.results.endsWith(".xml") || set.results.includes("*")
        ? join(cwd, set.results)
        : join(cwd, set.results, `${set.name}-${slug}.xml`);
    }
    if (runner.junit.file.includes("*")) return join(cwd, runner.junit.file);
    return join(out, "junit", `${set.name}-${slug}.xml`);
  }

  private static run(
    set: TestSet,
    runner: RunnerDefinition,
    folder: string,
    input: PlanInput,
  ): PlannedRun {
    const cwd = folder === "." ? input.root : join(input.root, folder);
    const slug = slugOf(folder);
    const format = TestSets.resultFormat(set);
    const results = QaPlan.results(set, runner, cwd, slug, input.out);
    const junitFile =
      format === "junit-xml" && !results.includes("*") ? results : "";
    const values: Record<string, string> = {
      evidenceDir: format === "qualify-evidence" ? results : "",
      filter: "",
      id: "",
      ids: "",
      junitDir: junitFile === "" ? "" : dirname(junitFile),
      junitFile,
      junitName: junitFile === "" ? "" : basename(junitFile),
      package: cwd,
      results,
      tool: CommandLines.tool(runner, cwd, input.root, input.index),
      workspaceFolder: input.root,
    };
    let command = CommandLines.fill(set.command ?? runner.command, values);
    const env: Record<string, string> = {};
    if (format === "qualify-evidence") {
      env.QUALIFY_EVIDENCE_DIR = results;
      env.QUALIFY_RUN_ID = input.runId;
    } else if (junitFile !== "") {
      if (set.command === undefined && runner.junit.args !== undefined) {
        command += ` ${CommandLines.fill(runner.junit.args, values)}`;
      }
      Object.assign(env, fillAll(runner.junit.env, values));
    }
    Object.assign(env, fillAll(set.env, values));
    return {
      command: command.replace(/ {2,}/g, " ").trim(),
      cwd,
      env,
      folder,
      format,
      results,
      runner,
      set,
      slug,
    };
  }
}
