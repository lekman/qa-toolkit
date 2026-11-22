import type { TestSetFile } from "@lekman/test-sets";

import type { SetResult } from "../run";

import { QaPlan } from "../plan";

/** Pads cells to the width of the widest in each column. */
const table = (rows: readonly (readonly string[])[]): string[] => {
  const widths = (rows[0] ?? []).map((_, i) =>
    Math.max(...rows.map((r) => (r[i] ?? "").length)),
  );
  return rows.map((r) =>
    r
      .map((c, i) => c.padEnd(widths[i] ?? 0))
      .join("  ")
      .trimEnd(),
  );
};

/** What `qa` prints: the sets for `qa list`, the results for `qa run`. */
export class ConsoleReport {
  /** The sets, their level and runner, and the folders each covers. */
  static list(file: TestSetFile, folders: readonly string[]): string[] {
    return table([
      ["SET", "LEVEL", "RUNNER", "FOLDERS"],
      ...file.sets.map((s) => {
        const matched = QaPlan.folders(s, folders);
        return [
          s.name,
          s.level,
          s.runner,
          matched.length > 0
            ? matched.join(", ")
            : `none match ${s.paths.join(", ")}`,
        ];
      }),
    ]);
  }

  /** The sets and folders that ran, their counts, and a closing line. */
  static results(results: readonly SetResult[]): string[] {
    const rows = results.map((r) => [
      r.status === "pass" ? "pass" : "FAIL",
      r.set,
      r.folder,
      `${r.summary.tests} tests`,
      `${r.summary.failures} failed`,
      `${r.summary.errors} errors`,
      `${r.summary.skipped} skipped`,
      `${(r.durationMs / 1000).toFixed(1)} s`,
      r.note ?? "",
    ]);
    const failed = results.filter((r) => r.status !== "pass").length;
    return [
      "",
      ...table(rows),
      "",
      failed === 0
        ? `${results.length} passed`
        : `${failed} of ${results.length} failed`,
    ];
  }
}
