import type { Level } from "../declaration";
import type { RunFile, RunSummary, TestRecord } from "../evidence";
import type { TraceFile } from "../trace";
import type { Block, ReportDocument, ReportInput } from "./types";

import { ReportText } from "./report-text";

const LEVELS: readonly Level[] = ["IQ", "OQ", "PQ", "IU"];
const OUTCOMES = ["pass", "fail", "error", "skip"] as const;
const DEFAULT_TITLE = "Qualification report";
const DEFAULT_ROLES = ["Prepared by", "Reviewed by", "Approved by"];

const m = (value: null | string | undefined): string =>
  value === null || value === undefined || value.length === 0
    ? ReportText.MISSING
    : value;

/**
 * The content of the qualification report, section 9.1: cover page, summary
 * and traceability, one section per test, and the signature block. Pure: the
 * layout and the PDF come later.
 */
export class ReportContent {
  /** The default signature roles. */
  static readonly DEFAULT_ROLES = DEFAULT_ROLES;

  /** Build the document. */
  static build(input: ReportInput): ReportDocument {
    const { run, options } = input;
    const title = options.title ?? DEFAULT_TITLE;
    const documentId = options.documentId ?? ReportContent.documentId(run);
    const blocks: Block[] = [
      ...ReportContent.cover(input, title, documentId),
      { kind: "pageBreak" },
      ...ReportContent.summary(run, input.trace),
      ...run.tests.flatMap((test) => ReportContent.test(test)),
    ];
    if (options.signatures !== null) {
      blocks.push(
        { kind: "heading", level: 1, text: "Signatures" },
        { kind: "signatures", roles: options.signatures },
      );
    }
    return {
      blocks,
      footer: { documentId, digest: input.digest.slice(0, 12) },
      metadata: {
        title,
        subject: run.run.id,
        keywords: `sha256:${input.digest}`,
        producer: `${input.tool.name} ${input.tool.version}`,
        creationDate: options.generatedAt,
      },
    };
  }

  /** `<total> tests: <pass> pass, <fail> fail, <error> error, <skip> skip` */
  static counts(
    summary: Pick<RunSummary, "error" | "fail" | "pass" | "skip" | "total">,
  ): string {
    return `${summary.total} tests: ${summary.pass} pass, ${summary.fail} fail, ${summary.error} error, ${summary.skip} skip`;
  }

  /** `QR-<environment>-<run start date as YYYYMMDD>` */
  static documentId(run: RunFile): string {
    return `QR-${run.run.environment}-${run.run.startedAt.slice(0, 10).replace(/-/g, "")}`;
  }

  private static cover(
    input: ReportInput,
    title: string,
    documentId: string,
  ): Block[] {
    const { run, digest, options } = input;
    const info = run.run;
    const overrides = info.policy.overrides.map((o) => `${o.id}: ${o.reason}`);
    return [
      { kind: "title", text: title },
      {
        kind: "fields",
        rows: [
          ["Document ID", documentId],
          ["Verdict", ReportText.verdict(run.summary.verdict)],
          ["Tests", ReportContent.counts(run.summary)],
          ["Environment", info.environment],
          ["Run ID", info.id],
          ["Run start", ReportText.time(info.startedAt)],
          ["Run end", ReportText.time(info.endedAt)],
          ["Commit", m(info.source.commit)],
          ["Branch", m(info.source.branch)],
          ["Tool", `${info.tool.name} ${info.tool.version}`],
          ["Generated", ReportText.time(options.generatedAt)],
          ["Run file SHA-256", digest],
          ["Merged runs", ReportText.list(info.mergedRuns ?? [])],
          ["Write overrides", ReportText.list(overrides)],
        ],
      },
    ];
  }

  private static list(items: readonly string[]): Block {
    return items.length === 0
      ? { kind: "paragraph", text: "None" }
      : { kind: "list", items: [...items] };
  }

  private static summary(run: RunFile, trace: TraceFile): Block[] {
    const row = (label: string, tests: readonly TestRecord[]): string[] => [
      label,
      String(tests.length),
      ...OUTCOMES.map((o) =>
        String(tests.filter((t) => t.outcome === o).length),
      ),
    ];
    const titles = new Map(trace.rows.map((r) => [r.testId, r.title]));
    return [
      { kind: "heading", level: 1, text: "Summary" },
      {
        kind: "table",
        columns: [
          { header: "Level", width: 0.2 },
          { header: "Total", width: 0.16 },
          { header: "Pass", width: 0.16 },
          { header: "Fail", width: 0.16 },
          { header: "Error", width: 0.16 },
          { header: "Skip", width: 0.16 },
        ],
        rows: [
          ...LEVELS.map((level) =>
            row(
              level,
              run.tests.filter((t) => t.level === level),
            ),
          ),
          row("All", run.tests),
        ],
      },
      { kind: "heading", level: 1, text: "Traceability" },
      {
        kind: "table",
        columns: [
          { header: "Requirement", width: 0.2 },
          { header: "Test ID", width: 0.18 },
          { header: "Level", width: 0.08 },
          { header: "Title", width: 0.3 },
          { header: "Risk", width: 0.1 },
          { header: "Outcome", width: 0.14 },
        ],
        rows: trace.rows.map((r) => [
          r.requirement === null
            ? ReportText.MISSING
            : `${r.requirement} (${r.sources.join(", ")})`,
          r.testId,
          r.level,
          r.title,
          m(r.risk),
          r.outcome,
        ]),
      },
      { kind: "heading", level: 2, text: "Not run" },
      ReportContent.list(
        trace.notRun.map((id) => `${id} ${titles.get(id) ?? ""}`.trim()),
      ),
      {
        kind: "heading",
        level: 2,
        text: "Requirements without a passing test",
      },
      ReportContent.list(trace.requirementsWithoutPass),
    ];
  }

  private static test(test: TestRecord): Block[] {
    const fields: [string, string][] = [
      ["Level", test.level],
      ["Outcome", test.outcome],
      ["Risk", m(test.risk)],
      ["Scope", test.scope],
      ["Requirements", ReportText.list(test.requirements)],
      ["Tags", ReportText.list(test.tags)],
      ["Controls", m(test.controls)],
    ];
    if (test.skipReason !== undefined)
      fields.push(["Skip reason", test.skipReason]);
    if (test.error !== undefined) {
      fields.push(
        ["Error type", test.error.type],
        ["Error message", test.error.message],
      );
    }
    fields.push(
      ["Given", test.given],
      ["When", test.when],
      ["Then", test.then],
      ...(test.and ?? []).map((clause): [string, string] => ["And", clause]),
      ["Started", ReportText.time(test.startedAt)],
      ["Duration", `${test.durationMs} ms`],
      ["Secrets used", ReportText.list(test.secretsUsed)],
    );
    const blocks: Block[] = [
      { kind: "heading", level: 1, text: `${test.id} ${test.title}` },
      { kind: "fields", rows: fields },
      { kind: "heading", level: 2, text: "Checks" },
    ];
    blocks.push(
      test.checks.length === 0
        ? { kind: "paragraph", text: "None" }
        : {
            kind: "table",
            columns: [
              { header: "#", width: 0.05 },
              { header: "Context", width: 0.13 },
              { header: "Description", width: 0.22 },
              { header: "Matcher", width: 0.1 },
              { header: "Expected", width: 0.18 },
              { header: "Actual", width: 0.18 },
              { header: "Result", width: 0.14 },
            ],
            rows: test.checks.map((c) => [
              String(c.seq + 1),
              c.context,
              c.description,
              c.matcher,
              ReportText.json(c.expected),
              ReportText.json(c.actual),
              `${c.pass ? "Pass" : "Fail"}${c.soft ? " (soft)" : ""}`,
            ]),
          },
      { kind: "heading", level: 2, text: "Attachments" },
      test.attachments.length === 0
        ? { kind: "paragraph", text: "None" }
        : {
            kind: "table",
            columns: [
              { header: "File", width: 0.22 },
              { header: "Content type", width: 0.2 },
              { header: "Size", width: 0.12 },
              { header: "SHA-256", width: 0.46 },
            ],
            rows: test.attachments.map((a) => [
              a.filename,
              a.contentType,
              `${a.sizeBytes} bytes`,
              a.sha256,
            ]),
          },
    );
    return blocks;
  }
}
