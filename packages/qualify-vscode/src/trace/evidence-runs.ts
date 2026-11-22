import type { TestSetFile } from "@lekman/test-sets";

import { TestSets } from "@lekman/test-sets";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

import type { QualifySettings } from "../settings";
import type { ITraceHost } from "./interfaces";
import type {
  EvidenceLocation,
  EvidenceRun,
  PickItem,
  TraceFolder,
} from "./types";

import { Levels } from "../levels";
import { Globs } from "../workspace";

/** The run file `qualify merge` writes in an evidence folder. */
const RUN_FILE = "test-evidence.json";
/** `<runId>__<testId>__<key>.json`, a record in an evidence folder's `records/`. */
const RECORD =
  /^([0-9A-HJKMNP-TV-Z]{26})__([A-Z]{2})-[^_]+__[0-9a-f]{8}\.json$/;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ORDER = ["IQ", "OQ", "PQ", "IU"];

const rel = (from: string, to: string): string =>
  relative(from, to).split("\\").join("/");

const clean = (dir: string): string => TestSets.normalise(dir);

const prefix = (pkg: string): string =>
  pkg === "**" ? "**/" : pkg === "." ? "" : `${pkg}/`;

const levelsOf = (levels: Iterable<string>): string[] =>
  ORDER.filter((l) => new Set(levels).has(l));

/** Finds the qualification runs of a workspace: merged run files, and records not merged yet. */
export class EvidenceRuns {
  /** Every run of every folder, newest first. */
  static async find(
    host: ITraceHost,
    folders: readonly TraceFolder[],
  ): Promise<EvidenceRun[]> {
    const runs: EvidenceRun[] = [];
    for (const folder of folders) {
      const qa = await host.read(join(folder.path, TestSets.FILE));
      const sets = qa === undefined ? undefined : TestSets.parse(qa).file;
      const locations = EvidenceRuns.locations(folder.settings, sets);
      const globs = EvidenceRuns.globs(locations);
      const exclude = folder.settings.exclude;
      const [runFiles, recordFiles] = await Promise.all([
        host.find(folder.path, globs.runs, exclude),
        host.find(folder.path, globs.records, exclude),
      ]);
      const merged = new Set<string>();
      for (const file of [...new Set(runFiles)].sort()) {
        const text = await host.read(file);
        const pkg = EvidenceRuns.packageOf(
          rel(folder.path, dirname(file)),
          locations,
        );
        const run =
          text === undefined
            ? undefined
            : EvidenceRuns.fromRunFile(folder, file, text, pkg);
        if (run === undefined) continue;
        runs.push(run);
        merged.add(run.dir);
      }
      const byDir = new Map<string, string[]>();
      for (const file of new Set(recordFiles)) {
        const dir = dirname(dirname(file));
        if (!merged.has(dir)) byDir.set(dir, [...(byDir.get(dir) ?? []), file]);
      }
      for (const [dir, files] of byDir) {
        const pkg = EvidenceRuns.packageOf(rel(folder.path, dir), locations);
        runs.push(...EvidenceRuns.fromRecords(folder, dir, files, pkg));
      }
    }
    return runs.sort((a, b) => b.startedMs - a.startedMs);
  }

  /**
   * The runs whose records are in an evidence folder without a run file,
   * one per run ID, from the record file names.
   */
  static fromRecords(
    folder: TraceFolder,
    dir: string,
    files: readonly string[],
    pkg: string,
  ): EvidenceRun[] {
    const byRun = new Map<string, { files: string[]; levels: Set<string> }>();
    for (const file of files) {
      const match = RECORD.exec(basename(file));
      if (match === null || !Levels.isQualification(match[2] as string))
        continue;
      const id = match[1] as string;
      const run = byRun.get(id) ?? { files: [], levels: new Set<string>() };
      run.files.push(file);
      run.levels.add(match[2] as string);
      byRun.set(id, run);
    }
    return [...byRun.entries()].map(([runId, run]) => ({
      dir,
      folder,
      levels: levelsOf(run.levels),
      package: pkg,
      records: [...run.files].sort(),
      recordsOfOtherRuns: byRun.size > 1,
      runId,
      startedMs: EvidenceRuns.ulidTime(runId),
      tests: run.files.length,
    }));
  }

  /** A run from the text of its run file, or `undefined` when it is not one. */
  static fromRunFile(
    folder: TraceFolder,
    file: string,
    text: string,
    pkg: string,
  ): EvidenceRun | undefined {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return undefined;
    }
    const d = data as {
      kind?: unknown;
      run?: {
        id?: unknown;
        startedAt?: unknown;
        tool?: { name?: unknown; version?: unknown };
      };
      summary?: { verdict?: unknown };
      tests?: { level?: unknown }[];
    };
    if (d.kind !== "run" || typeof d.run?.id !== "string") return undefined;
    const tests = Array.isArray(d.tests) ? d.tests : [];
    const started = Date.parse(String(d.run.startedAt));
    const tool = d.run.tool;
    return {
      dir: dirname(file),
      file,
      folder,
      levels: levelsOf(tests.map((t) => String(t.level))),
      package: pkg,
      runId: d.run.id,
      startedMs: Number.isNaN(started)
        ? EvidenceRuns.ulidTime(d.run.id)
        : started,
      tests: tests.length,
      ...(tool?.name === "@lekman/qualify" && typeof tool.version === "string"
        ? { toolVersion: tool.version }
        : {}),
      ...(typeof d.summary?.verdict === "string"
        ? { verdict: d.summary.verdict }
        : {}),
    };
  }

  /** The globs of run files and record files under the locations, relative to the workspace folder. */
  static globs(locations: readonly EvidenceLocation[]): {
    records: string[];
    runs: string[];
  } {
    const bases = locations.map((l) => `${prefix(l.package)}${l.dir}`);
    return {
      records: bases.map((b) => `${b}/**/records/*__*__*.json`),
      runs: bases.map((b) => `${b}/**/${RUN_FILE}`),
    };
  }

  /** How a run is shown in the quick pick: level, package and date; then its size and verdict. */
  static item(run: EvidenceRun): PickItem<EvidenceRun> {
    const date = `${new Date(run.startedMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
    const levels = run.levels.length > 0 ? run.levels.join("/") : "Run";
    const tests = run.tests === 1 ? "1 test" : `${run.tests} tests`;
    return {
      description:
        run.file === undefined
          ? `${tests} · records not merged yet`
          : `${tests} · ${run.verdict ?? "no verdict"}`,
      detail: rel(run.folder.path, run.dir),
      label: `${levels} · ${run.package} · ${date}`,
      value: run,
    };
  }

  /**
   * Where the packages of a folder write evidence: each qualification set of
   * qa.yaml with a results folder, each package in `qualify.packages` with an
   * evidence folder, and `qualify.evidenceDir` in every package. A folder
   * outside the workspace folder is left out.
   */
  static locations(
    settings: QualifySettings,
    sets: TestSetFile | undefined,
  ): EvidenceLocation[] {
    const out: EvidenceLocation[] = [];
    for (const set of sets?.sets ?? []) {
      if (!TestSets.isQualification(set.level) || set.results === undefined)
        continue;
      for (const path of set.paths)
        out.push({ dir: set.results, package: clean(path) });
    }
    for (const [path, own] of Object.entries(settings.packages)) {
      if (own.evidenceDir !== undefined)
        out.push({ dir: own.evidenceDir, package: path });
    }
    out.push({ dir: settings.evidenceDir, package: "**" });
    const seen = new Set<string>();
    return out
      .filter((l) => !isAbsolute(l.dir) && !clean(l.dir).startsWith(".."))
      .map((l) => ({ dir: clean(l.dir), package: l.package }))
      .filter((l) => {
        const key = `${l.package}\u0000${l.dir}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  /** The package of an evidence folder, relative to the workspace folder, from the location that matches it. */
  static packageOf(
    dir: string,
    locations: readonly EvidenceLocation[],
  ): string {
    for (const l of locations) {
      if (!Globs.matchesAny(`${dir}/`, [`${prefix(l.package)}${l.dir}/**`]))
        continue;
      if (l.package !== "**") {
        if (l.package === ".") return ".";
        return dir.split("/").slice(0, l.package.split("/").length).join("/");
      }
      const at = `/${dir}/`.indexOf(`/${l.dir}/`);
      return at <= 0 ? "." : dir.slice(0, at - 1);
    }
    return ".";
  }

  /** The time a ULID run ID was made, in milliseconds since the epoch. */
  static ulidTime(id: string): number {
    let ms = 0;
    for (const c of id.slice(0, 10).toUpperCase()) {
      const v = CROCKFORD.indexOf(c);
      if (v < 0) return 0;
      ms = ms * 32 + v;
    }
    return ms;
  }
}
