import { isAbsolute, join } from "node:path";

import type { ResolvedTest } from "../workspace";
import type { PlanContext, RunGroup, RunPlanResult } from "./types";

import { CommandLines } from "../runners";
import { Settings } from "../settings";

/**
 * Turns a selection of tests into commands: one per package and runner,
 * with the runner's own ID filter, or one per test when the command uses
 * `${id}`. A test with a declaration problem is refused, because the runner
 * would refuse it too.
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
      const key = `${test.folder.path}\u0000${test.package.root}\u0000${test.runner.id}`;
      buckets.set(key, [...(buckets.get(key) ?? []), test]);
    }
    const groups: RunGroup[] = [];
    for (const members of buckets.values()) {
      const first = members[0] as ResolvedTest;
      const settings = context.settings(first.folder.path);
      const template = Settings.command(
        settings,
        first.package.path,
        first.runner,
      );
      const sets = template.includes("${id}")
        ? members.map((m) => [m])
        : [members];
      for (const set of sets)
        groups.push(RunPlan.group(set, template, context));
    }
    return { groups, refused };
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
      (term.includes("${method}") && d.method === undefined) ||
      (term.includes("${class}") && d.className === undefined)
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
    const dir = Settings.evidenceDir(settings, first.package.path);
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
      env: { QUALIFY_EVIDENCE_DIR: evidenceDir, QUALIFY_RUN_ID: context.runId },
      evidenceDir,
      runner: first.runner,
      tests: [...tests],
    };
  }
}
