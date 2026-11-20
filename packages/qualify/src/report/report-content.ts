import type { Level } from "../declaration";
import type { RunFile, RunSummary, TestRecord } from "../evidence";
import type { CoverField, TokenValues } from "../theme";
import type { TraceFile } from "../trace";
import type { Block, Field, ReportDocument, ReportInput } from "./types";

import { Template } from "../theme";
import { ReportText } from "./report-text";

const LEVELS: readonly Level[] = ["IQ", "OQ", "PQ", "IU"];
const OUTCOMES = ["pass", "fail", "error", "skip"] as const;

const m = (value: null | string | undefined): string =>
  value === null || value === undefined || value.length === 0
    ? ReportText.MISSING
    : value;

/**
 * The content of the qualification report, section 9.1: the cover, the run
 * details, the summary and traceability, one section per test, and the
 * signature block. Pure: themes decide the texts, the layout comes later.
 */
export class ReportContent {
  /** Build the document. */
  static build(input: ReportInput): ReportDocument {
    const { run, options, theme } = input;
    const tokens = ReportContent.tokens(input);
    const subtitle =
      options.subtitle ?? Template.render(theme.texts.subtitle, tokens);
    const roles =
      options.signatures === undefined
        ? theme.signatures
        : (options.signatures ?? []);

    const blocks: Block[] = [
      { kind: "heading", level: 1, text: tokens.title },
      ...ReportContent.details(input),
      ...ReportContent.summary(run, input.trace),
      ...run.tests.flatMap((test) => ReportContent.test(test)),
    ];
    if (roles.length > 0) {
      blocks.push(
        { kind: "heading", level: 2, text: "Signatures" },
        { kind: "signatures", roles: [...roles] },
      );
    }
    return {
      blocks,
      classification: tokens.classification,
      cover: {
        brandName: theme.brand.name,
        title: tokens.title,
        subtitle,
        fields: ReportContent.coverFields(theme.cover.fields, tokens, run),
      },
      header: theme.texts.header,
      footer: theme.texts.footer,
      tokens,
      metadata: {
        title: tokens.title,
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

  /** The levels present, in IQ, OQ, PQ, IU order: `IQ`, `IQ and OQ`, `IQ, OQ and PQ`. */
  static levels(tests: readonly TestRecord[]): string {
    const present = LEVELS.filter((level) =>
      tests.some((t) => t.level === level),
    );
    if (present.length === 0) return ReportText.MISSING;
    if (present.length === 1) return present[0] as string;
    return `${present.slice(0, -1).join(", ")} and ${present.at(-1) as string}`;
  }

  /**
   * Token values for the theme's texts. The classification and the title are
   * resolved first, from flags or from their templates, so the others can use
   * them.
   */
  static tokens(input: ReportInput): TokenValues {
    const { run, options, theme, digest } = input;
    const base: TokenValues = {
      title: "",
      classification: "",
      documentId: options.documentId ?? ReportContent.documentId(run),
      environment: run.run.environment,
      levels: ReportContent.levels(run.tests),
      date: options.generatedAt.toISOString().slice(0, 10),
      version: m(run.run.target.version),
      verdict: ReportText.verdict(run.summary.verdict),
      runId: run.run.id,
      sha12: digest.slice(0, 12),
    };
    const classification =
      options.classification ??
      Template.render(theme.texts.classification, base);
    const title = options.title ?? Template.render(theme.texts.title, base);
    return { ...base, classification, title };
  }

  private static coverFields(
    fields: readonly CoverField[],
    tokens: TokenValues,
    run: RunFile,
  ): Field[] {
    const rows: Record<CoverField, Field> = {
      documentId: { label: "Document ID", value: tokens.documentId },
      date: { label: "Date", value: tokens.date },
      verdict: { label: "Verdict", value: tokens.verdict },
      tests: { label: "Tests", value: ReportContent.counts(run.summary) },
      environment: { label: "Environment", value: tokens.environment },
      version: { label: "Version", value: tokens.version },
      commit: {
        label: "Commit",
        value: m(run.run.source.commit?.slice(0, 12)),
      },
      classification: { label: "Classification", value: tokens.classification },
    };
    return fields
      .filter(
        (field) =>
          field !== "classification" || tokens.classification.length > 0,
      )
      .map((field) => rows[field]);
  }

  private static details(input: ReportInput): Block[] {
    const info = input.run.run;
    return [
      { kind: "heading", level: 2, text: "Run details" },
      {
        kind: "fields",
        fields: [
          { label: "Run ID", value: info.id, mono: true },
          { label: "Run start", value: ReportText.time(info.startedAt) },
          { label: "Run end", value: ReportText.time(info.endedAt) },
          { label: "Commit", value: m(info.source.commit), mono: true },
          { label: "Branch", value: m(info.source.branch) },
          { label: "Tool", value: `${info.tool.name} ${info.tool.version}` },
          {
            label: "Generated",
            value: ReportText.time(input.options.generatedAt),
          },
          { label: "Run file SHA-256", value: input.digest, mono: true },
          {
            label: "Merged runs",
            value: ReportText.list(info.mergedRuns ?? []),
            mono: true,
          },
          {
            label: "Write overrides",
            value: ReportText.list(
              info.policy.overrides.map((o) => `${o.id}: ${o.reason}`),
            ),
          },
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
      { kind: "heading", level: 2, text: "Summary" },
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
      { kind: "heading", level: 2, text: "Traceability" },
      {
        kind: "table",
        columns: [
          { header: "Requirement", width: 0.2 },
          { header: "Test ID", width: 0.19, mono: true },
          { header: "Level", width: 0.08 },
          { header: "Title", width: 0.3 },
          { header: "Risk", width: 0.09 },
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
      { kind: "heading", level: 3, text: "Not run" },
      ReportContent.list(
        trace.notRun.map((id) => `${id} ${titles.get(id) ?? ""}`.trim()),
      ),
      {
        kind: "heading",
        level: 3,
        text: "Requirements without a passing test",
      },
      ReportContent.list(trace.requirementsWithoutPass),
    ];
  }

  private static test(test: TestRecord): Block[] {
    const fields: Field[] = [
      { label: "Level", value: test.level },
      { label: "Outcome", value: test.outcome },
      { label: "Risk", value: m(test.risk) },
      { label: "Scope", value: test.scope },
      { label: "Requirements", value: ReportText.list(test.requirements) },
      { label: "Tags", value: ReportText.list(test.tags) },
      {
        label: "Controls",
        value: m(test.controls),
        mono: test.controls !== undefined,
      },
    ];
    if (test.skipReason !== undefined)
      fields.push({ label: "Skip reason", value: test.skipReason });
    if (test.error !== undefined) {
      fields.push(
        { label: "Error type", value: test.error.type },
        { label: "Error message", value: test.error.message },
      );
    }
    fields.push(
      { label: "Given", value: test.given },
      { label: "When", value: test.when },
      { label: "Then", value: test.then },
      ...(test.and ?? []).map((clause): Field => ({
        label: "And",
        value: clause,
      })),
      { label: "Started", value: ReportText.time(test.startedAt) },
      { label: "Duration", value: `${test.durationMs} ms` },
      { label: "Secrets used", value: ReportText.list(test.secretsUsed) },
    );
    return [
      { kind: "heading", level: 2, text: `${test.id} ${test.title}` },
      { kind: "fields", fields },
      { kind: "heading", level: 3, text: "Checks" },
      test.checks.length === 0
        ? { kind: "paragraph", text: "None" }
        : {
            kind: "table",
            columns: [
              { header: "#", width: 0.05 },
              { header: "Context", width: 0.13 },
              { header: "Description", width: 0.21 },
              { header: "Matcher", width: 0.11 },
              { header: "Expected", width: 0.18, mono: true },
              { header: "Actual", width: 0.18, mono: true },
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
      { kind: "heading", level: 3, text: "Attachments" },
      test.attachments.length === 0
        ? { kind: "paragraph", text: "None" }
        : {
            kind: "table",
            columns: [
              { header: "File", width: 0.2 },
              { header: "Content type", width: 0.2 },
              { header: "Size", width: 0.12 },
              { header: "SHA-256", width: 0.48, mono: true },
            ],
            rows: test.attachments.map((a) => [
              a.filename,
              a.contentType,
              `${a.sizeBytes} bytes`,
              a.sha256,
            ]),
          },
    ];
  }
}
