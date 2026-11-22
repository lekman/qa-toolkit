import { describe, expect, test } from "bun:test";

import { QualifyEvidence, TestResults } from "../../src/results";

const RUN = "01JZ0000000000000000000000";
const OTHER = "01JZ0000000000000000000001";

const record = (test: Record<string, unknown>, runId = RUN) =>
  JSON.stringify({
    kind: "record",
    run: { id: runId },
    schemaVersion: 1,
    test,
  });

const PASS = {
  checks: [],
  durationMs: 12,
  endedAt: "2026-11-22T10:00:01.000Z",
  id: "OQ-EXPORT-003",
  outcome: "pass",
  site: "a.test.ts:3",
};

const window = { runId: RUN, since: "2026-11-22T10:00:00.000Z" };

describe("QualifyEvidence", () => {
  test("reads a record file", () => {
    const [r] = QualifyEvidence.read("/e/r.json", record(PASS));
    expect(r).toEqual({
      checks: [],
      durationMs: 12,
      endedAt: "2026-11-22T10:00:01.000Z",
      id: "OQ-EXPORT-003",
      outcome: "pass",
      path: "/e/r.json",
      runId: RUN,
      site: "a.test.ts:3",
    });
  });

  test("reads every test of a run file", () => {
    const run = JSON.stringify({
      kind: "run",
      run: { id: RUN },
      tests: [
        PASS,
        {
          ...PASS,
          id: "OQ-EXPORT-004",
          outcome: "skip",
          skipReason: "blocked",
        },
        { id: "x" },
      ],
    });
    expect(
      QualifyEvidence.read("/e/test-evidence.json", run).map((r) => r.id),
    ).toEqual(["OQ-EXPORT-003", "OQ-EXPORT-004"]);
  });

  test("reads nothing from a started marker, other JSON or text that is not JSON", () => {
    expect(
      QualifyEvidence.read(
        "/e/a.started",
        JSON.stringify({ kind: "started", run: { id: RUN }, test: PASS }),
      ),
    ).toEqual([]);
    expect(QualifyEvidence.read("/e/package.json", "{}")).toEqual([]);
    expect(QualifyEvidence.read("/e/x.json", "not json")).toEqual([]);
    expect(
      QualifyEvidence.read("/e/x.json", record({ ...PASS, outcome: "maybe" })),
    ).toEqual([]);
    expect(QualifyEvidence.READER.accepts("/e/x.JSON")).toBe(true);
    expect(QualifyEvidence.READER.accepts("/e/x.started")).toBe(false);
  });
});

describe("TestResults", () => {
  test("a passing record", () => {
    const records = QualifyEvidence.read("/e/r.json", record(PASS));
    expect(
      TestResults.forTest("OQ-EXPORT-003", records, window, "why"),
    ).toEqual({
      durationMs: 12,
      messages: [],
      outcome: "pass",
      output: ["OQ-EXPORT-003: pass, evidence /e/r.json"],
    });
  });

  test("failed hard and soft checks become diff messages; the CheckFailed error is not repeated", () => {
    const records = QualifyEvidence.read(
      "/e/r.json",
      record({
        ...PASS,
        checks: [
          {
            actual: "100.5",
            context: "bank file",
            description: "EUR keeps two decimals",
            expected: "100.50",
            matcher: "equals",
            pass: false,
            site: "a.test.ts:9",
            soft: true,
          },
          {
            actual: 1,
            context: "c",
            description: "d",
            expected: 1,
            matcher: "equals",
            pass: true,
            soft: false,
          },
        ],
        error: {
          message: "1 soft check(s) failed",
          site: "a.test.ts:9",
          type: "CheckFailed",
        },
        outcome: "fail",
      }),
    );
    const result = TestResults.forTest("OQ-EXPORT-003", records, window, "why");
    expect(result.outcome).toBe("fail");
    expect(result.messages).toEqual([
      {
        actual: '"100.5"',
        expected: '"100.50"',
        text: "Soft check failed: bank file: EUR keeps two decimals (equals) at a.test.ts:9",
      },
      { text: "Evidence: /e/r.json" },
    ]);
  });

  test("an error outcome shows its type and message", () => {
    const records = QualifyEvidence.read(
      "/e/r.json",
      record({
        ...PASS,
        error: { message: "boom", site: null, type: "TypeError" },
        outcome: "error",
      }),
    );
    const result = TestResults.forTest("OQ-EXPORT-003", records, window, "why");
    expect(result.outcome).toBe("error");
    expect(result.messages[0]).toEqual({ text: "TypeError: boom" });
  });

  test("a skip keeps its reason in the output", () => {
    const records = QualifyEvidence.read(
      "/e/r.json",
      record({
        ...PASS,
        outcome: "skip",
        skipReason: "read-write test blocked",
      }),
    );
    expect(
      TestResults.forTest("OQ-EXPORT-003", records, window, "why").output,
    ).toEqual([
      "OQ-EXPORT-003: skip, evidence /e/r.json",
      "OQ-EXPORT-003: skipped: read-write test blocked",
    ]);
  });

  test("no record is not run, with the reason", () => {
    expect(
      TestResults.forTest(
        "OQ-EXPORT-003",
        [],
        window,
        "The command exited with code 1.",
      ),
    ).toEqual({
      messages: [],
      outcome: "not-run",
      output: ["OQ-EXPORT-003: not run. The command exited with code 1."],
    });
  });

  test("records of the run win; without them, records that ended after the start count", () => {
    const old = QualifyEvidence.read(
      "/e/old.json",
      record(
        { ...PASS, endedAt: "2026-11-21T00:00:00.000Z", outcome: "fail" },
        OTHER,
      ),
    );
    const later = QualifyEvidence.read(
      "/e/later.json",
      record({ ...PASS, outcome: "error" }, OTHER),
    );
    const mine = QualifyEvidence.read("/e/mine.json", record(PASS));
    expect(
      TestResults.select(
        "OQ-EXPORT-003",
        [...old, ...later, ...mine],
        window,
      ).map((r) => r.path),
    ).toEqual(["/e/mine.json"]);
    expect(
      TestResults.select("OQ-EXPORT-003", [...old, ...later], window).map(
        (r) => r.path,
      ),
    ).toEqual(["/e/later.json"]);
  });

  test("several records: the worst outcome wins, and a run file's copy is not counted twice", () => {
    const desktop = QualifyEvidence.read(
      "/e/desktop/IU-A.json",
      record({ ...PASS, id: "IU-SUPPORT-001" }, OTHER),
    );
    const copy = QualifyEvidence.read(
      "/e/desktop/test-evidence.json",
      JSON.stringify({
        kind: "run",
        run: { id: OTHER },
        tests: [{ ...PASS, id: "IU-SUPPORT-001" }],
      }),
    );
    const phone = QualifyEvidence.read(
      "/e/phone/IU-A.json",
      record(
        {
          ...PASS,
          durationMs: 40,
          error: { message: "m", site: null, type: "Error" },
          id: "IU-SUPPORT-001",
          outcome: "fail",
          site: "b:1",
        },
        "01JZ0000000000000000000002",
      ),
    );
    const result = TestResults.forTest(
      "IU-SUPPORT-001",
      [...desktop, ...copy, ...phone],
      window,
      "why",
    );
    expect(result.outcome).toBe("fail");
    expect(result.durationMs).toBe(40);
    expect(result.output).toHaveLength(2);
    expect(result.messages[0]?.text).toBe("[/e/phone/IU-A.json] Error: m");
  });
});
