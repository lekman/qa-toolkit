import type { JunitSummary } from "@lekman/test-sets";

import { CommandLines, JunitXml } from "@lekman/test-sets";
import { basename, dirname, join } from "node:path";

import type { PlannedRun } from "../plan";
import type { RunPorts } from "./interfaces";
import type {
  QualifySummary,
  RunOptions,
  RunOutcome,
  SetResult,
} from "./types";

/** Files changed this long before a command started still count, for clock skew. */
const SKEW_MS = 2000;
const NONE: JunitSummary = {
  errors: 0,
  failures: 0,
  skipped: 0,
  tests: 0,
  time: 0,
};

/** A basename glob, such as `TEST-*.xml`, as a regular expression. */
const nameGlob = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split("*")
      .map((p) => p.replace(/[.+?^$(){}|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );

/**
 * Runs a plan: each command in turn, then reads its JUnit XML or merges its
 * qualify evidence, and writes one merged JUnit report and a summary.
 */
export class QaRun {
  /** Runs every planned command and reads its results. */
  static async execute(
    runs: readonly PlannedRun[],
    options: RunOptions,
    ports: RunPorts,
  ): Promise<RunOutcome> {
    if (options.dryRun) {
      for (const run of runs) QaRun.announce(run, ports);
      return { exitCode: 0, results: [] };
    }
    await ports.files.reset(options.out);
    const results: SetResult[] = [];
    const reports: string[] = [];
    for (const run of runs) {
      QaRun.announce(run, ports);
      // Some runners, such as bun test, do not create the report's folder.
      await ports.files.mkdir(
        run.format === "junit-xml" && !run.results.includes("*")
          ? dirname(run.results)
          : run.results,
      );
      const started = ports.clock();
      const exitCode = await ports.process.run(run.command, {
        cwd: run.cwd,
        env: run.env,
      });
      const durationMs = ports.clock() - started;
      const base = {
        durationMs,
        exitCode,
        folder: run.folder,
        set: run.set.name,
      };
      const result =
        run.format === "junit-xml"
          ? await QaRun.junit(run, base, started - SKEW_MS, ports, reports)
          : await QaRun.qualify(run, base, options, ports);
      results.push(result);
    }
    if (reports.length > 0) {
      await ports.files.write(
        join(options.out, "junit.xml"),
        JunitXml.merge(reports),
      );
    }
    await ports.files.write(
      join(options.out, "summary.json"),
      `${JSON.stringify({ results }, null, 2)}\n`,
    );
    return {
      exitCode: results.some((r) => r.status !== "pass") ? 1 : 0,
      results,
    };
  }

  /** The counts and verdict of a qualify run file, or `undefined` when it is not one. */
  static runFileSummary(text: string | undefined): QualifySummary | undefined {
    if (text === undefined) return undefined;
    try {
      const doc = JSON.parse(text) as {
        kind?: string;
        summary?: QualifySummary;
      };
      return doc.kind === "run" ? doc.summary : undefined;
    } catch {
      return undefined;
    }
  }

  private static announce(run: PlannedRun, ports: RunPorts): void {
    const env = Object.entries(run.env)
      .map(([k, v]) => `${k}=${v} `)
      .join("");
    ports.log(`\n▶ ${run.set.name} (${run.folder}): ${env}${run.command}`);
  }

  private static async junit(
    run: PlannedRun,
    base: Omit<SetResult, "results" | "status" | "summary">,
    sinceMs: number,
    ports: RunPorts,
    reports: string[],
  ): Promise<SetResult> {
    const files = run.results.includes("*")
      ? (await ports.files.list(dirname(run.results), sinceMs)).filter((f) =>
          nameGlob(basename(run.results)).test(basename(f)),
        )
      : [run.results];
    const texts: string[] = [];
    for (const file of files) {
      const text = await ports.files.read(file);
      if (text !== undefined) texts.push(text);
    }
    if (texts.length === 0) {
      const note = `the command exited with ${base.exitCode ?? "no code"} and left no JUnit XML at ${run.results}`;
      reports.push(
        `<testsuites>${JunitXml.missing(`${run.set.name} (${run.folder})`, note)}</testsuites>`,
      );
      return { ...base, note, results: [], status: "fail", summary: NONE };
    }
    reports.push(...texts);
    const summary = JunitXml.summary(texts.flatMap((t) => JunitXml.cases(t)));
    const failed = base.exitCode !== 0 || summary.failures + summary.errors > 0;
    return {
      ...base,
      results: files,
      status: failed ? "fail" : "pass",
      summary,
      ...(base.exitCode !== 0 && summary.failures + summary.errors === 0
        ? { note: `the command exited with ${base.exitCode ?? "no code"}` }
        : {}),
    };
  }

  private static async qualify(
    run: PlannedRun,
    base: Omit<SetResult, "results" | "status" | "summary">,
    options: RunOptions,
    ports: RunPorts,
  ): Promise<SetResult> {
    const q = (s: string): string => CommandLines.quote(s, options.platform);
    const runFile = join(run.results, "test-evidence.json");
    const merged = await ports.process.run(
      `${options.qualify} merge --evidence-dir ${q(run.results)} --out ${q(runFile)}`,
      { cwd: options.root, env: {} },
    );
    const summary = QaRun.runFileSummary(await ports.files.read(runFile));
    if (summary === undefined) {
      const note = `qualify merge exited with ${merged ?? "no code"} and wrote no run file`;
      return { ...base, note, results: [], status: "fail", summary: NONE };
    }
    let report: string | undefined;
    if (options.report) {
      const pdf = join(
        options.out,
        "reports",
        `${run.set.name}-${run.slug}.pdf`,
      );
      const drawn = await ports.process.run(
        `${options.qualify} report ${q(runFile)} --pdf ${q(pdf)}`,
        {
          cwd: options.root,
          env: {},
        },
      );
      if (drawn === 0) report = pdf;
    }
    const pass = base.exitCode === 0 && summary.verdict === "pass";
    return {
      ...base,
      results: [runFile],
      status: pass ? "pass" : "fail",
      summary: {
        errors: summary.error,
        failures: summary.fail,
        skipped: summary.skip,
        tests: summary.total,
        time: base.durationMs / 1000,
      },
      ...(summary.verdict === "pass"
        ? {}
        : { note: `verdict ${summary.verdict}` }),
      ...(report === undefined ? {} : { report }),
    };
  }
}
