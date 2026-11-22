import type { TestSet } from "@lekman/test-sets";

import { TestSets } from "@lekman/test-sets";
import { basename, dirname, isAbsolute, join } from "node:path";

import type { ResolvedTest } from "../workspace";
import type { PlanContext, RunGroup, RunPlanResult } from "./types";

import { CommandLines } from "../runners";
import { Settings } from "../settings";

/**
 * Turns a selection of tests into commands: one per package and runner,
 * with the runner's own ID filter, or one per test when the command uses
 * `${id}`. A test with a declaration problem is refused, because the runner
 * would refuse it too. An ordinary test from a `qa.yaml` set runs with its
 * whole set in its package, and its result comes from JUnit XML.
 */
export class RunPlan {
  /** The plan for the selected tests. */
  static build(
    tests: readonly ResolvedTest[],
    context: PlanContext,
  ): RunPlanResult {
    const refused = tests.flatMap((test) => {
      const reason = RunPlan.refusal(test);
      return reason === undefined ? [] : [{ reason, test }];
    });
    const runnable = tests.filter((t) => RunPlan.refusal(t) === undefined);
    const buckets = new Map<string, ResolvedTest[]>();
    for (const test of runnable) {
      const key = `${test.folder.path}\u0000${test.package.root}\u0000${test.runner.id}\u0000${test.set?.name ?? ""}`;
      buckets.set(key, [...(buckets.get(key) ?? []), test]);
    }
    const groups: RunGroup[] = [];
    for (const members of buckets.values()) {
      const first = members[0] as ResolvedTest;
      if (first.set !== undefined) {
        groups.push(RunPlan.ordinary(members, first.set, context));
        continue;
      }
      const settings = context.settings(first.folder.path);
      const own = Settings.command(settings, first.package.path, first.runner);
      const template =
        own === first.runner.command
          ? (RunPlan.qualificationSet(first, context)?.command ?? own)
          : own;
      const sets = template.includes("${id}")
        ? members.map((m) => [m])
        : [members];
      for (const set of sets)
        groups.push(RunPlan.group(set, template, context));
    }
    return { groups, refused };
  }

  /**
   * The qualification set of `qa.yaml` that covers a test's package with the
   * test's runner, which lends its command, results folder and variables.
   */
  static qualificationSet(
    test: ResolvedTest,
    context: PlanContext,
  ): TestSet | undefined {
    const file = context.sets(test.folder.path);
    if (file === undefined) return undefined;
    return TestSets.forFolder(file, test.package.path).find(
      (s) => TestSets.isQualification(s.level) && s.runner === test.runner.id,
    );
  }

  /**
   * Why a test cannot run: a declaration problem, or a runner that selects by
   * method when the method could not be read.
   */
  static refusal(test: ResolvedTest): string | undefined {
    const d = test.declaration;
    if (d.problems.length > 0) return `not run: ${d.problems.join("; ")}`;
    const term = test.runner.select.term;
    if (
      test.set === undefined &&
      ((term.includes("${method}") && d.method === undefined) ||
        (term.includes("${class}") && d.className === undefined))
    ) {
      return `not run: ${test.runner.label} selects a test by class and method, and they could not be read from ${d.file}`;
    }
    return undefined;
  }

  private static group(
    tests: readonly ResolvedTest[],
    template: string,
    context: PlanContext,
  ): RunGroup {
    const first = tests[0] as ResolvedTest;
    const settings = context.settings(first.folder.path);
    const set = RunPlan.qualificationSet(first, context);
    const dir =
      settings.packages[first.package.path]?.evidenceDir ??
      set?.results ??
      settings.evidenceDir;
    const evidenceDir = isAbsolute(dir) ? dir : join(first.package.root, dir);
    const ids = tests.map((t) => t.declaration.id);
    const command = CommandLines.fill(template, {
      evidenceDir,
      filter: CommandLines.filter(
        first.runner.select,
        tests.map((t) => t.declaration),
        context.platform,
      ),
      id: ids[0] as string,
      ids: ids.join(" "),
      package: first.package.root,
      tool: CommandLines.tool(
        first.runner,
        first.package.root,
        first.folder.path,
        context.index(first.folder.path),
      ),
      workspaceFolder: first.folder.path,
    })
      .replace(/\s+/g, " ")
      .trim();
    return {
      command,
      cwd: first.package.root,
      env: {
        ...set?.env,
        QUALIFY_EVIDENCE_DIR: evidenceDir,
        QUALIFY_RUN_ID: context.runId,
      },
      evidenceDir,
      format: "qualify-evidence",
      results: evidenceDir,
      runner: first.runner,
      tests: [...tests],
    };
  }

  /**
   * The command for the ordinary tests of one set in one package: the set's
   * command, or the runner's with the arguments that make it write JUnit
   * XML to a file of this run.
   */
  private static ordinary(
    tests: readonly ResolvedTest[],
    set: TestSet,
    context: PlanContext,
  ): RunGroup {
    const first = tests[0] as ResolvedTest;
    const runner = first.runner;
    const root = first.package.root;
    const slug =
      first.package.path === "."
        ? "root"
        : first.package.path.replace(/\//g, "-");
    let results: string;
    if (set.results !== undefined) {
      const at = isAbsolute(set.results)
        ? set.results
        : join(root, set.results);
      results =
        at.endsWith(".xml") || at.includes("*")
          ? at
          : join(at, `${set.name}.xml`);
    } else if (set.command === undefined && !runner.junit.file.includes("*")) {
      results = join(
        context.resultsDir,
        context.runId,
        `${set.name}-${slug}.xml`,
      );
    } else {
      results = join(root, runner.junit.file);
    }
    const junitFile = results.includes("*") ? "" : results;
    const values = {
      evidenceDir: "",
      filter: "",
      id: "",
      ids: "",
      junitDir: junitFile === "" ? "" : dirname(junitFile),
      junitFile,
      junitName: junitFile === "" ? "" : basename(junitFile),
      package: root,
      results,
      tool: CommandLines.tool(
        runner,
        root,
        first.folder.path,
        context.index(first.folder.path),
      ),
      workspaceFolder: first.folder.path,
    };
    const args =
      set.command === undefined && junitFile !== ""
        ? (runner.junit.args ?? "")
        : "";
    const command = CommandLines.fill(
      `${set.command ?? runner.command} ${args}`,
      values,
    )
      .replace(/ {2,}/g, " ")
      .trim();
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries({
      ...(junitFile === "" ? {} : runner.junit.env),
      ...set.env,
    })) {
      env[k] = CommandLines.fill(v, values);
    }
    return {
      command,
      cwd: root,
      env,
      evidenceDir: "",
      format: "junit-xml",
      results,
      runner,
      tests: [...tests],
    };
  }
}
