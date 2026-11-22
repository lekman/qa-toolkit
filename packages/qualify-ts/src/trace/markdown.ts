import type { TraceFile, TraceRow } from "./types";

const cell = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

const list = (values: readonly string[]): string =>
  values.length === 0 ? "none" : values.join(", ");

const requirementCell = (row: TraceRow): string =>
  row.requirement === null
    ? "(none)"
    : `${cell(row.requirement)} (${row.sources.join(", ")})`;

/** Renders `trace.md` from the same data as `trace.json`. */
export class TraceMarkdown {
  /** The Markdown report. */
  static render(trace: TraceFile): string {
    const s = trace.summary;
    const titles = new Map(trace.rows.map((r) => [r.testId, r.title]));
    const lines = [
      "# Trace Matrix",
      "",
      `- Environments: ${list([...new Set(trace.runs.map((r) => r.environment))])}`,
      `- Runs: ${list(trace.runs.map((r) => `${r.id} (${r.verdict})`))}`,
      `- Commits: ${list([...new Set(trace.runs.map((r) => r.commit ?? "unknown"))])}`,
      "",
      "| Input | Role | SHA-256 |",
      "| ----- | ---- | ------- |",
      ...trace.inputs.map(
        (i) => `| ${cell(i.path)} | ${i.role} | ${i.sha256} |`,
      ),
      "",
      `**Summary:** ${s.tests} tests: ${s.pass} pass, ${s.fail} fail, ${s.error} error, ${s.skip} skip; ${s.notRun} not run; ${s.requirements} requirements, ${s.requirementsWithoutPass} without a passing test. Verdict: ${s.verdict}.`,
      "",
      "## Matrix",
      "",
      "| Requirement | Test ID | Level | Title | Risk | Outcome | Run |",
      "| ----------- | ------- | ----- | ----- | ---- | ------- | --- |",
      ...trace.rows.map(
        (r) =>
          `| ${requirementCell(r)} | ${r.testId}${r.controls === null ? "" : ` (control for ${r.controls})`} | ${r.level} | ${cell(r.title)} | ${r.risk ?? "-"} | ${r.outcome} | ${r.run ?? "-"} |`,
      ),
      "",
      "## Not Run",
      "",
      ...(trace.notRun.length === 0
        ? ["None."]
        : trace.notRun.map((id) => `- ${id}: ${cell(titles.get(id) ?? "")}`)),
      "",
      "## Requirements Without a Passing Test",
      "",
      ...(trace.requirementsWithoutPass.length === 0
        ? ["None."]
        : trace.requirementsWithoutPass.map((r) => `- ${cell(r)}`)),
    ];
    return `${lines.join("\n")}\n`;
  }
}
