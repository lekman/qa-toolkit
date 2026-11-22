import { dirname, join, relative } from "node:path";

import type { ITraceHost } from "./interfaces";
import type { EvidenceRun, ExecResult, TraceFolder } from "./types";

import { EvidenceRuns } from "./evidence-runs";
import { QualifyCli } from "./qualify-cli";

/** Exit codes of `qualify merge` and `qualify trace` that still write their file: pass, fail, incomplete. */
const WROTE = new Set([0, 1, 3]);
/** The file the trace matrix is written to, next to its run file. */
const TRACE_FILE = "trace.md";

const rel = (folder: TraceFolder, path: string): string =>
  relative(folder.path, path).split("\\").join("/") || ".";

/** The last lines a command printed, for an error message. */
const tail = (result: ExecResult): string => {
  const lines = result.output
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  const last = lines.slice(-3).join(" ");
  const how =
    result.code === null ? "did not finish" : `exited with code ${result.code}`;
  return last.length > 0 ? `it ${how}: ${last}` : `it ${how}`;
};

/**
 * **Qualify: Open Trace Matrix**. Opens a trace matrix that exists; when
 * there is none, builds one with `qualify trace` from the newest run, or
 * from the run the user picks, merging its records first when no run file
 * holds them. When there is no run at all, it offers to run the
 * qualification tests and then tries again.
 */
export class TraceMatrix {
  /** Builds the trace matrix of a run next to its run file; its path, or `undefined` after showing why it could not. */
  static async build(
    host: ITraceHost,
    run: EvidenceRun,
  ): Promise<string | undefined> {
    const cli = QualifyCli.command(
      await QualifyCli.facts(host, run),
      host.platform,
    );
    const cwd = run.folder.path;
    let runFile = run.file;
    if (runFile === undefined) {
      runFile = join(run.dir, "test-evidence.json");
      let from = run.dir;
      if (run.recordsOfOtherRuns === true) {
        from = await host.tempDir();
        await host.copy(run.records ?? [], join(from, "records"));
      }
      const merged = await host.exec(
        QualifyCli.merge(cli, from, runFile, host.platform),
        cwd,
      );
      if (!WROTE.has(merged.code ?? -1) || !(await host.exists(runFile))) {
        host.error(
          `The trace matrix cannot be built: qualify merge could not build a run file from the records in ${rel(run.folder, run.dir)}, and ${tail(merged)}`,
        );
        return undefined;
      }
    }
    const trace = join(dirname(runFile), TRACE_FILE);
    const result = await host.exec(
      QualifyCli.trace(cli, runFile, trace, host.platform),
      cwd,
    );
    if (!WROTE.has(result.code ?? -1) || !(await host.exists(trace))) {
      host.error(
        `The trace matrix cannot be built: qualify trace could not read ${rel(run.folder, runFile)}, and ${tail(result)}`,
      );
      return undefined;
    }
    return trace;
  }

  /** Runs the command. */
  static async open(host: ITraceHost): Promise<void> {
    const folders = host.folders();
    if (folders.length === 0) {
      host.error(
        "There is no trace matrix to open: no folder is open in this window.",
      );
      return;
    }
    const traces = await TraceMatrix.traces(host, folders);
    if (traces.length > 0) {
      const picked =
        traces.length === 1
          ? traces[0]?.path
          : await host.pick(
              traces.map((t) => ({ label: t.label, value: t.path })),
              "Which trace matrix?",
            );
      if (picked !== undefined) await host.open(picked);
      return;
    }
    let runs = await EvidenceRuns.find(host, folders);
    if (runs.length === 0) {
      const run = await host.confirm(
        "There is no trace matrix yet, and no qualification run to build one from.",
        "Run qualification tests",
      );
      if (!run) return;
      await host.runQualification();
      runs = await EvidenceRuns.find(host, folders);
      if (runs.length === 0) {
        host.error(
          "The qualification tests ran but left no evidence in the evidence folders that qualify.evidenceDir, qualify.packages and qa.yaml name, so there is no trace matrix to build.",
        );
        return;
      }
    }
    const run =
      runs.length === 1
        ? runs[0]
        : await host.pick(
            runs.map(EvidenceRuns.item),
            "Build the trace matrix of which run?",
          );
    if (run === undefined) return;
    const trace = await TraceMatrix.build(host, run);
    if (trace !== undefined) await host.open(trace);
  }

  /** The trace matrices `qualify trace` wrote, found with `qualify.traceFiles`, each labelled by its path. */
  static async traces(
    host: ITraceHost,
    folders: readonly TraceFolder[],
  ): Promise<{ label: string; path: string }[]> {
    const found = await Promise.all(
      folders.map(async (f) =>
        (
          await host.find(f.path, [f.settings.traceFiles], f.settings.exclude)
        ).map((path) => ({
          label:
            folders.length > 1 ? `${f.name}/${rel(f, path)}` : rel(f, path),
          path,
        })),
      ),
    );
    return found.flat().sort((a, b) => (a.label < b.label ? -1 : 1));
  }
}
