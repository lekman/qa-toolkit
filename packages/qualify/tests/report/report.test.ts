import { describe, expect, test } from "bun:test";

import type { RunFile, TestRecord } from "../../src/evidence";
import type { ReportOptions } from "../../src/report";
import type { Theme } from "../../src/theme";

import { extractPdf, missingFromOutline } from "../../conformance/pdf-text";
import { Merge } from "../../src/merge";
import { PdfRenderer, ReportContent } from "../../src/report";
import { Trace } from "../../src/trace";
import { envelope, testRecord } from "../mocks/evidence.mock";
import { theme } from "../mocks/theme.mock";

const runFile = (
  tests: TestRecord[],
  extra: Partial<RunFile["run"]> = {},
): RunFile => ({
  schemaVersion: 1,
  kind: "run",
  run: {
    ...envelope(),
    source: {
      commit: "0123456789abcdef0123456789abcdef01234567",
      branch: "main",
      dirty: false,
    },
    target: { version: "4.2.0" },
    policy: {
      productionWriteBlocked: true,
      overrides: [{ id: "OQ-A1-002", reason: "hotfix" }],
    },
    mergedRuns: ["01HQA1ZQJ0C0NF0RMANCE00001"],
    startedAt: "2026-03-04T05:06:07.000Z",
    endedAt: "2026-03-04T05:07:07.000Z",
    ...extra,
  },
  summary: Merge.summary(tests),
  tests,
});

const TESTS = [
  testRecord("IQ-A1-002", { controls: "OQ-A1-001" }),
  testRecord("OQ-A1-001", {
    title: "Ωμέγα Привет 入力",
    requirements: ["REQ-1"],
    risk: "high",
    and: ["first", "second"],
    checks: [
      {
        seq: 0,
        context: "c",
        description: "long value",
        matcher: "equals",
        expected: "x".repeat(250),
        actual: { b: 1, a: 2 },
        pass: false,
        soft: true,
        site: "s:1",
      },
    ],
    attachments: [
      {
        filename: "a.json",
        contentType: "application/json",
        encoding: "base64",
        content: "e30K",
        sizeBytes: 3,
        sha256: "a".repeat(64),
      },
    ],
    secretsUsed: ["TOKEN"],
    outcome: "fail",
    error: {
      type: "CheckFailed",
      message: "1 soft check(s) failed",
      site: null,
    },
  }),
];

const input = (
  run: RunFile,
  t: Theme,
  options: Partial<ReportOptions> = {},
) => ({
  run,
  digest: "d".repeat(64),
  trace: Trace.build({
    evidence: [{ path: "run.json", sha256: "b".repeat(64), content: run }],
    protocol: {
      path: "p.yaml",
      sha256: "c".repeat(64),
      content: [
        {
          id: "OQ-A1-009",
          title: "never ran",
          level: "OQ" as const,
          requirements: ["REQ-9"],
        },
      ],
    },
    failOnSkip: false,
  }).trace,
  theme: t.spec,
  tool: { name: "@lekman/qualify", version: "9.9.9" },
  options: { generatedAt: new Date("2026-01-02T03:04:05.006Z"), ...options },
});

describe("ReportContent", () => {
  test("tokens come from the run, the flags and the theme", async () => {
    const lekman = await theme("lekman");
    const tokens = ReportContent.tokens(input(runFile(TESTS), lekman));
    expect(tokens).toEqual({
      title: "Qualification report",
      classification: "Internal",
      documentId: "QR-local-20260304",
      environment: "local",
      levels: "IQ and OQ",
      date: "2026-01-02",
      version: "4.2.0",
      verdict: "Failed",
      runId: envelope().id,
      sha12: "d".repeat(12),
    });
    const flagged = ReportContent.tokens(
      input(runFile(TESTS), lekman, {
        title: "T {x}",
        classification: "Secret",
        documentId: "DOC",
      }),
    );
    expect([flagged.title, flagged.classification, flagged.documentId]).toEqual(
      ["T {x}", "Secret", "DOC"],
    );
  });

  test("levels are joined in IQ, OQ, PQ, IU order", () => {
    const of = (...levels: string[]) =>
      levels.map((l, i) => testRecord(`${l}-A1-00${i}`));
    expect(ReportContent.levels([])).toBe("-");
    expect(ReportContent.levels(of("OQ"))).toBe("OQ");
    expect(ReportContent.levels(of("PQ", "IQ", "OQ"))).toBe("IQ, OQ and PQ");
    expect(ReportContent.levels(of("IU", "IQ", "OQ", "PQ"))).toBe(
      "IQ, OQ, PQ and IU",
    );
  });

  test("cover rows follow the theme; an empty classification drops its row", async () => {
    const lekman = await theme("lekman");
    const plain = await theme("plain");
    const doc = ReportContent.build(input(runFile(TESTS), lekman));
    expect(doc.cover.fields.map((f) => f.label)).toEqual([
      "Document ID",
      "Date",
      "Verdict",
      "Tests",
      "Environment",
      "Version",
      "Classification",
    ]);
    expect(doc.cover.subtitle).toBe(
      "IQ and OQ qualification, local environment, 2026-01-02",
    );
    expect(doc.cover.brandName).toBe("lekman.com");
    const p = ReportContent.build(
      input(
        runFile(TESTS, { source: { commit: null, branch: null, dirty: null } }),
        plain,
      ),
    );
    expect(p.cover.fields.map((f) => [f.label, f.value]).at(-1)).toEqual([
      "Commit",
      "-",
    ]);
    const none = ReportContent.build(
      input(runFile(TESTS), lekman, { classification: "" }),
    );
    expect(none.cover.fields.some((f) => f.label === "Classification")).toBe(
      false,
    );
    expect(
      ReportContent.build(input(runFile(TESTS), plain)).cover.fields.at(-1),
    ).toEqual({
      label: "Commit",
      value: "0123456789ab",
    });
  });

  test("signatures: the theme's, the flag's, or none", async () => {
    const lekman = await theme("lekman");
    const roles = (options: Partial<ReportOptions>) =>
      ReportContent.build(input(runFile([]), lekman, options)).blocks.find(
        (b) => b.kind === "signatures",
      );
    expect(roles({})).toEqual({
      kind: "signatures",
      roles: ["Prepared by", "Reviewed by", "Approved by"],
    });
    expect(roles({ signatures: ["Owner"] })).toEqual({
      kind: "signatures",
      roles: ["Owner"],
    });
    expect(roles({ signatures: null })).toBeUndefined();
    expect(
      ReportContent.counts({ total: 3, pass: 1, fail: 1, error: 0, skip: 1 }),
    ).toBe("3 tests: 1 pass, 1 fail, 0 error, 1 skip");
  });
});

describe("PdfRenderer", () => {
  test.each(["lekman", "plain"] as const)(
    "renders every section in order with the %s theme",
    async (name) => {
      const t = await theme(name);
      const pdf = await extractPdf(
        await PdfRenderer.render(
          ReportContent.build(input(runFile(TESTS), t)),
          t,
        ),
      );
      expect(pdf.info).toMatchObject({
        Title: "Qualification report",
        Subject: envelope().id,
        Keywords: `sha256:${"d".repeat(64)}`,
        Producer: "@lekman/qualify 9.9.9",
      });
      expect(String(pdf.info.CreationDate)).toStartWith("D:20260102030405");
      const missing = missingFromOutline(pdf.lines, [
        ...(name === "lekman" ? ["lekman.com"] : []),
        "Qualification report",
        "IQ and OQ qualification, local environment, 2026-01-02",
        "QR-local-20260304",
        "Failed",
        "2 tests: 1 pass, 1 fail, 0 error, 0 skip",
        "4.2.0",
        name === "lekman" ? "Internal" : "0123456789ab",
        "Qualification report",
        "Run details",
        envelope().id,
        "2026-03-04 05:06:07 UTC",
        "2026-01-02 03:04:05 UTC",
        "01HQA1ZQJ0C0NF0RMANCE00001",
        "OQ-A1-002: hotfix",
        "REQ-1 (code)",
        "OQ-A1-001",
        "high",
        "fail",
        "REQ-9 (protocol)",
        "Not run",
        "OQ-A1-009 never ran",
        "Requirements without a passing test",
        "IQ-A1-002",
        "OQ-A1-001",
        "CheckFailed",
        "1 soft check(s) failed",
        "first",
        "second",
        "TOKEN",
        '{"a":2,"b":1}',
        "Fail (soft)",
        "a.json",
        "3 bytes",
        "Prepared by",
        "Reviewed by",
        "Approved by",
      ]);
      expect(missing).toBeUndefined();
      // The cover has no header and no footer; every later page has both.
      expect(pdf.pageLines[0]?.some((line) => line.includes("Page 1"))).toBe(
        false,
      );
      for (let n = 2; n <= pdf.pages; n++) {
        const lines = pdf.pageLines[n - 1] as string[];
        expect(lines.some((l) => l.includes(`Page ${n} of ${pdf.pages}`))).toBe(
          true,
        );
        expect(lines[0]?.startsWith("Qualification report")).toBe(true);
      }
      // CJK is not in either theme's fonts.
      expect(pdf.lines.join("\n")).toContain("??");
    },
  );

  test("a JPEG logo and a Letter page", async () => {
    const lekman = await theme("lekman");
    // The smallest valid baseline JPEG: one white 1x1 pixel.
    const jpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
      "base64",
    );
    const letter: Theme = {
      ...lekman,
      logo: { bytes: new Uint8Array(jpeg), format: "jpeg" },
      spec: { ...lekman.spec, page: { size: "Letter", marginMm: 20 } },
    };
    expect(PdfRenderer.geometry(letter).width).toBe(612);
    const bytes = await PdfRenderer.render(
      ReportContent.build(input(runFile([]), letter)),
      letter,
    );
    expect((await extractPdf(bytes)).pages).toBeGreaterThan(1);
  });
});
