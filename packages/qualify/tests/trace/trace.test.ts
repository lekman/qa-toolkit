import { describe, expect, test } from "bun:test";

import type { RunFile, TestRecord } from "../../src/evidence";
import type { TraceRequest } from "../../src/trace";

import { Merge } from "../../src/merge";
import { Schema } from "../../src/schema";
import {
  Trace,
  TraceInputError,
  TraceInputs,
  TraceMarkdown,
} from "../../src/trace";
import { envelope, OTHER_RUN, testRecord } from "../mocks/evidence.mock";

const runFile = (tests: TestRecord[], id = envelope().id): RunFile => ({
  schemaVersion: 1,
  kind: "run",
  run: {
    ...envelope({ id }),
    startedAt: "2026-01-02T03:04:05.000Z",
    endedAt: "2026-01-02T03:04:05.000Z",
  },
  summary: Merge.summary(tests),
  tests,
});

const request = (
  tests: TestRecord[],
  extra: Partial<TraceRequest> = {},
): TraceRequest => ({
  evidence: [
    { path: "ev.json", sha256: "a".repeat(64), content: runFile(tests) },
  ],
  failOnSkip: false,
  ...extra,
});

describe("TraceInputs", () => {
  test("protocol.yaml", () => {
    const entries = TraceInputs.protocol(
      "tests:\n  - id: OQ-A1-001\n    title: T\n    level: OQ\n    requirements: [R1]\n    risk: high\n  - {id: IQ-A1-002, title: U, level: IQ}\n",
      "p.yaml",
    );
    expect(entries).toEqual([
      {
        id: "OQ-A1-001",
        title: "T",
        level: "OQ",
        requirements: ["R1"],
        risk: "high",
      },
      { id: "IQ-A1-002", title: "U", level: "IQ", requirements: [] },
    ]);
  });

  test.each([
    ["tests: [", "not valid YAML"],
    ["[]", 'must have a "tests" list'],
    ["tests: [5]", "must be a mapping"],
    [
      "tests: [{id: OQ-A1-001, title: T, level: OQ, extra: 1}]",
      "unknown field extra",
    ],
    ["tests: [{id: bad, title: T, level: OQ}]", "id must be a test ID"],
    [
      "tests: [{id: OQ-A1-001, title: T, level: IQ}]",
      "level must be the prefix",
    ],
    [
      "tests: [{id: OQ-A1-001, title: '', level: OQ}]",
      "title must not be empty",
    ],
    [
      "tests: [{id: OQ-A1-001, title: T, level: OQ, risk: huge}]",
      "risk must be",
    ],
    [
      "tests: [{id: OQ-A1-001, title: T, level: OQ}, {id: OQ-A1-001, title: T, level: OQ}]",
      "listed twice",
    ],
    [
      "tests: [{id: OQ-A1-001, title: T, level: OQ, requirements: [R, R]}]",
      "listed twice",
    ],
  ])("protocol %p is refused", (text, message) => {
    expect(() => TraceInputs.protocol(text, "p.yaml")).toThrow(message);
  });

  test("trace.yaml", () => {
    expect(
      TraceInputs.map("OQ-A1-001: R1\nOQ-A1-002: [R2, R3]\n", "m.yaml"),
    ).toEqual(
      new Map([
        ["OQ-A1-001", ["R1"]],
        ["OQ-A1-002", ["R2", "R3"]],
      ]),
    );
    expect(TraceInputs.map("", "m.yaml").size).toBe(0);
    expect(() => TraceInputs.map("[1]", "m.yaml")).toThrow(TraceInputError);
    expect(() => TraceInputs.map("bad: R", "m.yaml")).toThrow("not a test ID");
    expect(() => TraceInputs.map("OQ-A1-001: [5]", "m.yaml")).toThrow(
      "requirement IDs of 1 to 64",
    );
  });
});

describe("Trace.build", () => {
  test("links from code, protocol and map, with their sources", () => {
    const { trace, exitCode } = Trace.build(
      request(
        [testRecord("OQ-A1-001", { requirements: ["R1", "R2"], risk: "low" })],
        {
          protocol: {
            path: "p.yaml",
            sha256: "b".repeat(64),
            content: [
              {
                id: "OQ-A1-001",
                title: "T",
                level: "OQ",
                requirements: ["R2", "R4"],
              },
            ],
          },
          map: {
            path: "m.yaml",
            sha256: "c".repeat(64),
            content: new Map([["OQ-A1-001", ["R3", "R1"]]]),
          },
        },
      ),
    );
    expect(Schema.trace(trace)).toEqual([]);
    expect(exitCode).toBe(0);
    expect(trace.rows.map((r) => [r.requirement, r.sources, r.risk])).toEqual([
      ["R1", ["code", "map"], "low"],
      ["R2", ["code", "protocol"], "low"],
      ["R3", ["map"], "low"],
      ["R4", ["protocol"], "low"],
    ]);
    expect(trace.inputs.map((i) => i.role)).toEqual([
      "evidence",
      "protocol",
      "map",
    ]);
    expect(trace.summary).toMatchObject({
      tests: 1,
      pass: 1,
      requirements: 4,
      requirementsWithoutPass: 0,
      verdict: "pass",
    });
  });

  test("a protocol ID with no record is not run, exit 3", () => {
    const { trace, exitCode } = Trace.build(
      request([testRecord("OQ-A1-001")], {
        protocol: {
          path: "p.yaml",
          sha256: "b".repeat(64),
          content: [
            { id: "OQ-A1-001", title: "T", level: "OQ", requirements: [] },
            {
              id: "OQ-A1-002",
              title: "U",
              level: "OQ",
              requirements: ["R9"],
              risk: "high",
            },
          ],
        },
      }),
    );
    expect(exitCode).toBe(3);
    expect(trace.notRun).toEqual(["OQ-A1-002"]);
    expect(trace.requirementsWithoutPass).toEqual(["R9"]);
    expect(trace.rows[0]).toMatchObject({
      requirement: "R9",
      testId: "OQ-A1-002",
      outcome: "not-run",
      run: null,
      risk: "high",
    });
    expect(trace.summary.verdict).toBe("incomplete");
  });

  test("exit codes for failures, no records and skips", () => {
    expect(
      Trace.build(
        request([
          testRecord("OQ-A1-001", {
            outcome: "error",
            error: { type: "E", message: "m", site: null },
          }),
        ]),
      ).exitCode,
    ).toBe(1);
    expect(Trace.build(request([])).exitCode).toBe(3);
    const skipped = [
      testRecord("OQ-A1-001", { outcome: "skip", skipReason: "r" }),
    ];
    expect(Trace.build(request(skipped)).exitCode).toBe(0);
    expect(Trace.build(request(skipped, { failOnSkip: true })).exitCode).toBe(
      3,
    );
    const protocol = {
      path: "p",
      sha256: "b".repeat(64),
      content: [
        { id: "OQ-A1-009", title: "x", level: "OQ" as const, requirements: [] },
      ],
    };
    const outside = [testRecord("OQ-A1-009"), ...skipped];
    expect(
      Trace.build(request(outside, { failOnSkip: true, protocol })).exitCode,
    ).toBe(0);
  });

  test("a control test follows the test it controls", () => {
    const tests = [
      testRecord("OQ-A1-001", { requirements: ["R1"], controls: "OQ-A1-009" }),
      testRecord("OQ-A1-005", { requirements: ["R1"] }),
      testRecord("OQ-A1-009", { requirements: ["R1"] }),
      testRecord("OQ-A1-010"),
    ];
    const { trace } = Trace.build(request(tests));
    expect(trace.rows.map((r) => r.testId)).toEqual([
      "OQ-A1-005",
      "OQ-A1-009",
      "OQ-A1-001",
      "OQ-A1-010",
    ]);
  });

  test("rows per run when a test ran in two runs", () => {
    const a = runFile([testRecord("OQ-A1-001")]);
    const b = runFile(
      [
        testRecord("OQ-A1-001", {
          outcome: "fail",
          error: { type: "CheckFailed", message: "m", site: null },
        }),
      ],
      OTHER_RUN,
    );
    const { trace, exitCode } = Trace.build({
      evidence: [
        { path: "b.json", sha256: "b".repeat(64), content: b },
        { path: "a.json", sha256: "a".repeat(64), content: a },
      ],
      failOnSkip: false,
    });
    expect(exitCode).toBe(1);
    expect(trace.rows.map((r) => r.run)).toEqual([a.run.id, OTHER_RUN]);
    expect(trace.runs.map((r) => r.verdict)).toEqual(["fail", "pass"]);
  });
});

describe("TraceMarkdown", () => {
  test("renders header, summary, matrix and lists", () => {
    const { trace } = Trace.build(
      request(
        [
          testRecord("OQ-A1-001", {
            title: "pipe | here",
            requirements: ["R1"],
          }),
          testRecord("OQ-A1-002", { controls: "OQ-A1-001" }),
        ],
        {
          protocol: {
            path: "p.yaml",
            sha256: "b".repeat(64),
            content: [
              {
                id: "OQ-A1-003",
                title: "never",
                level: "OQ",
                requirements: ["R2"],
              },
            ],
          },
        },
      ),
    );
    const md = TraceMarkdown.render(trace);
    expect(md).toContain("# Trace Matrix");
    expect(md).toContain("- Environments: local");
    expect(md).toContain("- Commits: unknown");
    expect(md).toContain(`| ev.json | evidence | ${"a".repeat(64)} |`);
    expect(md).toContain(
      "**Summary:** 2 tests: 2 pass, 0 fail, 0 error, 0 skip; 1 not run; 2 requirements, 1 without a passing test. Verdict: incomplete.",
    );
    expect(md).toContain(
      "| R1 (code) | OQ-A1-001 | OQ | pipe \\| here | - | pass |",
    );
    expect(md).toContain("| (none) | OQ-A1-002 (control for OQ-A1-001) |");
    expect(md).toContain("- OQ-A1-003: never");
    expect(md).toContain("## Requirements Without a Passing Test\n\n- R2\n");
    const empty = TraceMarkdown.render(
      Trace.build(request([testRecord("OQ-A1-001")])).trace,
    );
    expect(empty).toContain("## Not Run\n\nNone.");
    expect(empty).toContain(
      "## Requirements Without a Passing Test\n\nNone.\n",
    );
  });
});
