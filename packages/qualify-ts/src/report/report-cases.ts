import type { CoverageCounter, RunFile, TestCase } from "../evidence";
import type { Block, Field } from "./types";

import { Values } from "../values";
import { ReportText } from "./report-text";

const m = (value: null | string | undefined): string =>
  value === null || value === undefined || value.length === 0
    ? ReportText.MISSING
    : value;

/**
 * The parts of the report for a run file written by `import junit`, section
 * 9.1 items 4 and 5: coverage, the failed test cases in full, and every test
 * case in one table. Pure, like the rest of the report content.
 */
export class ReportCases {
  /** The test case sections, or nothing when the run file has no cases. */
  static cases(run: RunFile): Block[] {
    const cases = run.cases;
    if (cases === undefined) return [];
    const failed = cases.filter(
      (c) => c.outcome === "fail" || c.outcome === "error",
    );
    return [
      { kind: "heading", level: 2, text: "Failed test cases" },
      ...(failed.length === 0
        ? [{ kind: "paragraph", text: "None" } as Block]
        : failed.flatMap((c) => ReportCases.failed(c))),
      { kind: "heading", level: 2, text: "Test cases" },
      cases.length === 0
        ? { kind: "paragraph", text: "None" }
        : {
            kind: "table",
            columns: [
              { header: "Class", width: 0.28 },
              { header: "Name", width: 0.42 },
              { header: "Outcome", width: 0.18 },
              { header: "Duration", width: 0.12 },
            ],
            rows: cases.map((c) => [
              c.classname ?? m(c.suite),
              c.name,
              c.skipReason === undefined ? c.outcome : `skip: ${c.skipReason}`,
              `${c.durationMs} ms`,
            ]),
          },
    ];
  }

  /** `<percent>% (<hit>/<found>)`, or `-` when nothing was found. */
  static cell(counter: CoverageCounter): string {
    return counter.percent === null
      ? ReportText.MISSING
      : `${ReportCases.percent(counter)} (${counter.hit}/${counter.found})`;
  }

  /** The coverage sections, or nothing when the run file has no coverage. */
  static coverage(run: RunFile): Block[] {
    const coverage = run.coverage;
    if (coverage === undefined) return [];
    const { totals } = coverage;
    const files = [...coverage.files].sort(
      (a, b) =>
        (a.lines.percent ?? Number.POSITIVE_INFINITY) -
          (b.lines.percent ?? Number.POSITIVE_INFINITY) ||
        Values.compare(a.path, b.path),
    );
    const total = (label: string, c: CoverageCounter): string[] => [
      label,
      String(c.found),
      String(c.hit),
      ReportCases.percent(c),
    ];
    return [
      { kind: "heading", level: 2, text: "Coverage" },
      {
        kind: "table",
        columns: [
          { header: "Measure", width: 0.31 },
          { header: "Found", width: 0.23 },
          { header: "Hit", width: 0.23 },
          { header: "Percent", width: 0.23 },
        ],
        rows: [
          total("Lines", totals.lines),
          total("Functions", totals.functions),
          total("Branches", totals.branches),
        ],
      },
      { kind: "heading", level: 3, text: "Coverage by file" },
      files.length === 0
        ? { kind: "paragraph", text: "None" }
        : {
            kind: "table",
            columns: [
              { header: "File", width: 0.4, mono: true },
              { header: "Lines", width: 0.2 },
              { header: "Functions", width: 0.2 },
              { header: "Branches", width: 0.2 },
            ],
            rows: files.map((f) => [
              f.path,
              ReportCases.cell(f.lines),
              ReportCases.cell(f.functions),
              ReportCases.cell(f.branches),
            ]),
          },
    ];
  }

  /** A percentage with two decimals and `%`, or `-` when nothing was found. */
  static percent(counter: CoverageCounter): string {
    return counter.percent === null
      ? ReportText.MISSING
      : `${counter.percent.toFixed(2)}%`;
  }

  private static failed(c: TestCase): Block[] {
    const fields: Field[] = [
      { label: "Suite", value: m(c.suite) },
      { label: "Class", value: m(c.classname) },
      { label: "Test ID", value: m(c.id), mono: c.id !== undefined },
      { label: "Level", value: c.level },
      { label: "Outcome", value: c.outcome },
      { label: "File", value: m(c.file) },
      { label: "Duration", value: `${c.durationMs} ms` },
      { label: "Error type", value: c.error?.type ?? ReportText.MISSING },
      { label: "Error message", value: m(c.error?.message) },
    ];
    return [
      { kind: "heading", level: 3, text: c.name },
      { kind: "fields", fields },
      ...(c.error?.detail === undefined
        ? []
        : [{ kind: "paragraph", text: c.error.detail, mono: true } as Block]),
    ];
  }
}
