import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RunFile, TestRecord } from "../../src/evidence";
import type { ReportFonts } from "../../src/report";

import { extractPdf, missingFromOutline } from "../../conformance/pdf-text";
import { Merge } from "../../src/merge";
import { PdfRenderer, ReportContent } from "../../src/report";
import { Trace } from "../../src/trace";
import { envelope, testRecord } from "../mocks/evidence.mock";

const fonts = (): ReportFonts => {
  const dir = join(import.meta.dir, "../../fonts");
  return {
    regular: new Uint8Array(readFileSync(join(dir, "NotoSans-Regular.ttf"))),
    bold: new Uint8Array(readFileSync(join(dir, "NotoSans-Bold.ttf"))),
  };
};

const runFile = (tests: TestRecord[]): RunFile => ({
  schemaVersion: 1,
  kind: "run",
  run: {
    ...envelope({ mergedRuns: undefined } as never),
    policy: {
      productionWriteBlocked: true,
      overrides: [{ id: "OQ-A1-002", reason: "hotfix" }],
    },
    mergedRuns: ["01HQA1ZQJ0C0NF0RMANCE00001"],
    startedAt: "2026-03-04T05:06:07.000Z",
    endedAt: "2026-03-04T05:07:07.000Z",
  },
  summary: Merge.summary(tests),
  tests,
});

const TESTS = [
  testRecord("OQ-A1-001", {
    title: "Ωμέγα Привет 入力",
    requirements: ["REQ-1"],
    risk: "high",
    tags: ["export"],
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
  testRecord("OQ-A1-002", { controls: "OQ-A1-001" }),
];

const render = async (
  run: RunFile,
  signatures: null | string[] = ReportContent.DEFAULT_ROLES,
) => {
  const trace = Trace.build({
    evidence: [{ path: "run.json", sha256: "b".repeat(64), content: run }],
    protocol: {
      path: "p.yaml",
      sha256: "c".repeat(64),
      content: [
        {
          id: "OQ-A1-009",
          title: "never ran",
          level: "OQ",
          requirements: ["REQ-9"],
        },
      ],
    },
    failOnSkip: false,
  }).trace;
  const document = ReportContent.build({
    run,
    digest: "d".repeat(64),
    trace,
    tool: { name: "@lekman/qualify", version: "9.9.9" },
    options: { generatedAt: new Date("2026-01-02T03:04:05.006Z"), signatures },
  });
  return {
    document,
    pdf: await extractPdf(await PdfRenderer.render(document, fonts())),
  };
};

describe("ReportContent", () => {
  test("defaults: title, document ID and roles", async () => {
    const { document } = await render(runFile(TESTS));
    expect(document.metadata).toEqual({
      title: "Qualification report",
      subject: envelope().id,
      keywords: `sha256:${"d".repeat(64)}`,
      producer: "@lekman/qualify 9.9.9",
      creationDate: new Date("2026-01-02T03:04:05.006Z"),
    });
    expect(document.footer).toEqual({
      documentId: "QR-local-20260304",
      digest: "d".repeat(12),
    });
    expect(
      ReportContent.counts({ total: 3, pass: 1, fail: 1, error: 0, skip: 1 }),
    ).toBe("3 tests: 1 pass, 1 fail, 0 error, 1 skip");
  });

  test("title, document ID and no signature block", () => {
    const run = runFile([]);
    const document = ReportContent.build({
      run,
      digest: "d".repeat(64),
      trace: Trace.build({
        evidence: [{ path: "r", sha256: "b".repeat(64), content: run }],
        failOnSkip: false,
      }).trace,
      tool: { name: "t", version: "1" },
      options: {
        generatedAt: new Date(0),
        signatures: null,
        title: "T",
        documentId: "DOC-1",
      },
    });
    expect(document.metadata.title).toBe("T");
    expect(document.footer.documentId).toBe("DOC-1");
    expect(document.blocks.some((b) => b.kind === "signatures")).toBe(false);
  });
});

describe("PdfRenderer", () => {
  test("renders every section in order, with metadata", async () => {
    const { pdf } = await render(runFile(TESTS));
    expect(pdf.info).toMatchObject({
      Title: "Qualification report",
      Subject: envelope().id,
      Keywords: `sha256:${"d".repeat(64)}`,
      Producer: "@lekman/qualify 9.9.9",
    });
    expect(String(pdf.info.CreationDate)).toStartWith("D:20260102030405");
    const missing = missingFromOutline(pdf.lines, [
      "Qualification report",
      "QR-local-20260304",
      "Failed",
      "2 tests: 1 pass, 1 fail, 0 error, 0 skip",
      "2026-03-04 05:06:07 UTC",
      "2026-01-02 03:04:05 UTC",
      "01HQA1ZQJ0C0NF0RMANCE00001",
      "OQ-A1-002: hotfix",
      "REQ-1 (code)",
      "OQ-A1-001",
      "Ωμέγα Привет ??",
      "high",
      "fail",
      "REQ-9 (protocol)",
      "OQ-A1-009",
      "not-run",
      "Not run",
      "OQ-A1-009 never ran",
      "Requirements without a passing test",
      "REQ-1",
      "OQ-A1-001 Ωμέγα Привет ??",
      "CheckFailed",
      "1 soft check(s) failed",
      "first",
      "second",
      "TOKEN",
      "1",
      "long value",
      '{"a":2,"b":1}',
      "Fail (soft)",
      "(52",
      "a.json",
      "3 bytes",
      "OQ-A1-002",
      "OQ-A1-001",
      "Prepared by",
      "Reviewed by",
      "Approved by",
    ]);
    expect(missing).toBeUndefined();
    for (let n = 1; n <= pdf.pages; n++) {
      expect(
        pdf.lines.some((l) => l.includes(`Page ${n} of ${pdf.pages}`)),
      ).toBe(true);
    }
  });

  test("custom roles, and none", async () => {
    const custom = await render(runFile([]), ["Owner"]);
    expect(custom.pdf.lines).toContain("Owner");
    const none = await render(runFile([]), null);
    expect(none.pdf.lines.join("\n")).not.toContain("Prepared by");
  });
});
