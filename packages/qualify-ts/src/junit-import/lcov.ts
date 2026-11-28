import { isAbsolute, relative, sep } from "node:path";

import type { Coverage, CoverageCounter, CoverageFile } from "../evidence";
import type { LcovRecord } from "./types";

import { Values } from "../values";
import { ImportError } from "./errors";

type Measure = "branches" | "functions" | "lines";

const MEASURES: readonly Measure[] = ["lines", "functions", "branches"];

const TOTALS: Record<string, [Measure, "found" | "hit"]> = {
  BRF: ["branches", "found"],
  BRH: ["branches", "hit"],
  FNF: ["functions", "found"],
  FNH: ["functions", "hit"],
  LF: ["lines", "found"],
  LH: ["lines", "hit"],
};

const add = <K>(map: Map<K, number>, key: K, count: number): void => {
  map.set(key, (map.get(key) ?? 0) + count);
};

/**
 * LCOV tracefiles read into coverage, section 6.6. Pure: the caller reads the
 * files and passes their text.
 */
export class Lcov {
  /** `found`, `hit`, and the percentage with two decimals, or `null` for nothing found. */
  static counter(found: number, hit: number): CoverageCounter {
    return {
      found,
      hit,
      percent: found === 0 ? null : Math.round((hit / found) * 10000) / 100,
    };
  }

  /** Combine records into per-file and total coverage. */
  static coverage(records: readonly LcovRecord[], cwd: string): Coverage {
    const byPath = new Map<string, LcovRecord[]>();
    for (const record of records) {
      const path = Lcov.path(record.path, cwd);
      byPath.set(path, [...(byPath.get(path) ?? []), record]);
    }
    const files: CoverageFile[] = [...byPath]
      .sort(([a], [b]) => Values.compare(a, b))
      .map(([path, group]) => ({
        path,
        lines: Lcov.measure(group, "lines"),
        functions: Lcov.measure(group, "functions"),
        branches: Lcov.measure(group, "branches"),
      }));
    const total = (measure: Measure): CoverageCounter =>
      Lcov.counter(
        files.reduce((sum, f) => sum + f[measure].found, 0),
        files.reduce((sum, f) => sum + f[measure].hit, 0),
      );
    return {
      totals: {
        lines: total("lines"),
        functions: total("functions"),
        branches: total("branches"),
      },
      files,
    };
  }

  /** Read a tracefile. `where` names it in error messages. */
  static parse(text: string, where: string): LcovRecord[] {
    const records: LcovRecord[] = [];
    let record: LcovRecord | undefined;
    const close = (line: number): void => {
      if (record === undefined) return;
      for (const measure of MEASURES) {
        const t = record.totals[measure];
        if (t !== undefined && t.hit > t.found) {
          throw new ImportError(
            `${where}:${line}: ${record.path} states more ${measure} hit than found`,
          );
        }
      }
      records.push(record);
      record = undefined;
    };
    const lines = text.split(/\r?\n/);
    lines.forEach((raw, index) => {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith("#") || line.startsWith("TN:"))
        return;
      if (line === "end_of_record") {
        close(index + 1);
        return;
      }
      const colon = line.indexOf(":");
      const tag = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1);
      const fail = (message: string): never => {
        throw new ImportError(`${where}:${index + 1}: ${message}`);
      };
      if (tag === "SF") {
        close(index + 1);
        record = {
          path: value,
          lines: new Map(),
          functions: new Map(),
          branches: new Map(),
          totals: {},
        };
        return;
      }
      if (record === undefined) return fail(`${tag} before an SF line`);
      Lcov.line(record, tag, value, fail);
    });
    close(lines.length);
    return records;
  }

  /** A record's path, relative to `cwd` when it is inside it, with `/`. */
  static path(path: string, cwd: string): string {
    let result = path;
    if (isAbsolute(path)) {
      const inside = relative(cwd, path);
      if (
        inside.length > 0 &&
        !inside.startsWith("..") &&
        !isAbsolute(inside)
      ) {
        result = inside;
      }
    }
    return result.split(sep).join("/").replace(/\\/g, "/");
  }

  /** Read one line of a record into it. Unknown tags are ignored. */
  private static line(
    record: LcovRecord,
    tag: string,
    value: string,
    fail: (message: string) => never,
  ): void {
    const parts = value.split(",");
    const count = (text: string | undefined): number => {
      const n = text === "-" ? 0 : Number(text);
      if (text === undefined || !Number.isInteger(n) || n < 0)
        return fail(`${tag}:${value} is not a valid record`);
      return n;
    };
    const total = TOTALS[tag];
    if (total !== undefined) {
      const [measure, field] = total;
      const current = record.totals[measure] ?? { found: 0, hit: 0 };
      current[field] = count(parts[0]);
      record.totals[measure] = current;
      return;
    }
    switch (tag) {
      case "BRDA":
        if (parts.length < 4) fail(`${tag}:${value} is not a valid record`);
        add(record.branches, parts.slice(0, -1).join(","), count(parts.at(-1)));
        return;
      case "DA":
        add(record.lines, count(parts[0]), count(parts[1]));
        return;
      case "FN": {
        // FN:<line>,<name> or, since lcov 2.0, FN:<line>,<end line>,<name>.
        const named = parts.length > 2 && /^\d+$/.test(parts[1] as string);
        const name = parts.slice(named ? 2 : 1).join(",");
        if (name.length === 0) fail(`${tag}:${value} is not a valid record`);
        add(record.functions, name, 0);
        return;
      }
      case "FNA": {
        // FNA:<index>,<count>,<name>, the lcov 2.2 form of FNDA.
        const name = parts.slice(2).join(",");
        if (name.length === 0) fail(`${tag}:${value} is not a valid record`);
        add(record.functions, name, count(parts[1]));
        return;
      }
      case "FNDA": {
        const name = parts.slice(1).join(",");
        if (name.length === 0) fail(`${tag}:${value} is not a valid record`);
        add(record.functions, name, count(parts[0]));
        return;
      }
    }
  }

  /**
   * One measure of one file over its records. Detailed records add their
   * counts per item; a file with none takes the largest stated totals.
   */
  private static measure(
    group: readonly LcovRecord[],
    measure: Measure,
  ): CoverageCounter {
    const items = new Map<number | string, number>();
    for (const record of group) {
      for (const [key, n] of record[measure] as Map<number | string, number>)
        add(items, key, n);
    }
    if (items.size > 0) {
      return Lcov.counter(
        items.size,
        [...items.values()].filter((n) => n > 0).length,
      );
    }
    const stated = group.flatMap((r) => {
      const t = r.totals[measure];
      return t === undefined ? [] : [t];
    });
    return Lcov.counter(
      Math.max(0, ...stated.map((t) => t.found)),
      Math.max(0, ...stated.map((t) => t.hit)),
    );
  }
}
