import { describe, expect, test } from "bun:test";

import type { MergeOptions, MergeResult } from "../../src/merge";

import { Merge } from "../../src/merge";
import { Schema } from "../../src/schema";
import {
  envelope,
  inputs,
  markerEntry,
  OTHER_RUN,
  recordEntry,
  RUN_ID,
  testRecord,
} from "../mocks/evidence.mock";

const options = (overrides: Partial<MergeOptions> = {}): MergeOptions => ({
  allowRuns: [],
  emptyEnvelope: () => envelope({ environment: "empty" }),
  now: () => new Date("2026-02-03T04:05:06.007Z"),
  ...overrides,
});

const ok = (result: MergeResult) => {
  if (!result.ok) throw new Error(result.errors.join("\n"));
  expect(Schema.evidence(result.file)).toEqual([]);
  return result;
};

const errors = (result: MergeResult): string[] => {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
};

describe("Merge.build", () => {
  test("pairs markers and records, sorts by ID and summarises", () => {
    const b = testRecord("OQ-B1-001", {
      startedAt: "2026-01-02T03:04:06.000Z",
      endedAt: "2026-01-02T03:04:09.000Z",
    });
    const a = testRecord("IQ-A1-001", { outcome: "skip", skipReason: "n/a" });
    const result = ok(
      Merge.build(
        inputs(recordEntry(b), markerEntry(b), recordEntry(a), markerEntry(a), [
          ".x.tmp",
          "partial",
        ]),
        options(),
      ),
    );
    expect(result.exitCode).toBe(0);
    expect(result.file.tests.map((t) => t.id)).toEqual([
      "IQ-A1-001",
      "OQ-B1-001",
    ]);
    expect(result.file.summary).toEqual({
      total: 2,
      pass: 1,
      fail: 0,
      error: 0,
      skip: 1,
      verdict: "pass",
    });
    expect(result.file.run.startedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(result.file.run.endedAt).toBe("2026-01-02T03:04:09.000Z");
    expect(result.file.run.mergedRuns).toBeUndefined();
  });

  test("a marker without a record becomes DidNotFinish", () => {
    const t = testRecord("OQ-C1-001");
    const result = ok(Merge.build(inputs(markerEntry(t)), options()));
    expect(result.exitCode).toBe(1);
    expect(result.file.tests[0]).toMatchObject({
      outcome: "error",
      error: {
        type: "DidNotFinish",
        message: "test started and did not finish",
        site: null,
      },
      startedAt: t.startedAt,
      endedAt: t.startedAt,
      durationMs: 0,
      checks: [],
    });
  });

  test("no records is incomplete, with this process's envelope", () => {
    const result = ok(Merge.build([], options()));
    expect(result.exitCode).toBe(3);
    expect(result.file.summary.verdict).toBe("incomplete");
    expect(result.file.run.environment).toBe("empty");
    expect(result.file.run.startedAt).toBe("2026-02-03T04:05:06.007Z");
  });

  test("refuses two records with one test ID", () => {
    const one = testRecord("OQ-D1-001", { site: "tests/a.test.ts:1" });
    const two = testRecord("OQ-D1-001", { site: "tests/b.test.ts:1" });
    expect(
      errors(
        Merge.build(inputs(recordEntry(one), recordEntry(two)), options()),
      )[0],
    ).toContain("test ID OQ-D1-001 appears 2 times");
  });

  test("refuses mixed runs unless --allow-runs names the others", () => {
    const main = recordEntry(testRecord("OQ-E1-001"));
    const other = recordEntry(
      testRecord("OQ-E1-002"),
      envelope({ id: OTHER_RUN }),
    );
    expect(errors(Merge.build(inputs(main, other), options()))[0]).toContain(
      "more than one run",
    );
    const merged = ok(
      Merge.build(inputs(main, other), options({ allowRuns: [OTHER_RUN] })),
    );
    expect(merged.file.run.id).toBe(RUN_ID);
    expect(merged.file.run.mergedRuns).toEqual([OTHER_RUN]);
    expect(
      errors(
        Merge.build(
          inputs(main, other),
          options({ allowRuns: [RUN_ID, OTHER_RUN] }),
        ),
      )[0],
    ).toContain("names every run");
  });

  test("refuses envelopes that disagree", () => {
    const a = recordEntry(testRecord("OQ-F1-001"));
    const b = recordEntry(
      testRecord("OQ-F1-002"),
      envelope({ environment: "staging" }),
    );
    const c = recordEntry(
      testRecord("OQ-F1-003"),
      envelope({ source: { commit: null, branch: "x", dirty: false } }),
    );
    const found = errors(Merge.build(inputs(a, b, c), options()));
    expect(found).toHaveLength(2);
    expect(found[0]).toContain("disagree on environment");
    expect(found[1]).toContain("disagree on source");
  });

  test("takes tool, actor and target from the lowest test ID; keeps an agreed selection", () => {
    const selection = {
      levels: ["OQ" as const],
      ids: [],
      tags: [],
      excludeTags: [],
    };
    const a = recordEntry(
      testRecord("OQ-G1-002"),
      envelope({
        actor: { name: "second", ci: null, ciRunUrl: null },
        selection,
      }),
    );
    const b = recordEntry(
      testRecord("OQ-G1-001"),
      envelope({
        actor: { name: "first", ci: null, ciRunUrl: null },
        selection,
      }),
    );
    const result = ok(Merge.build(inputs(a, b), options()));
    expect(result.file.run.actor.name).toBe("first");
    expect(result.file.run.selection).toEqual(selection);
  });

  test("invalid inputs", () => {
    const [name, text] = recordEntry(testRecord("OQ-H1-001"));
    expect(errors(Merge.build(inputs([name, "{"]), options()))[0]).toContain(
      "not valid JSON",
    );
    expect(errors(Merge.build(inputs([name, "{}"]), options()))[0]).toContain(
      name,
    );
    expect(
      errors(Merge.build(inputs(["notes.txt", text]), options()))[0],
    ).toContain("not a record or marker name");
    expect(
      errors(
        Merge.build(
          inputs([name.replace(".json", ".started"), text]),
          options(),
        ),
      )[0],
    ).toContain("holds a record file, not a started");
    const [otherName] = recordEntry(testRecord("OQ-H1-002"));
    expect(
      errors(Merge.build(inputs([otherName, text]), options()))[0],
    ).toContain("does not match");
    const wrongLevel = JSON.parse(text);
    wrongLevel.test.level = "PQ";
    expect(
      errors(
        Merge.build(inputs([name, JSON.stringify(wrongLevel)]), options()),
      )[0],
    ).toContain("does not match its level PQ");
  });

  test("applies the pattern rules again, attachments included", () => {
    const key = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
    const content = Buffer.from(`x ${key} y`).toString("base64");
    const t = testRecord("OQ-I1-001", {
      title: `leaked ${key}`,
      attachments: [
        {
          filename: "a.txt",
          contentType: "text/plain",
          encoding: "base64",
          content,
          sizeBytes: 22,
          sha256: "0".repeat(64),
        },
        {
          filename: "b.txt",
          contentType: "text/plain",
          encoding: "base64",
          content: "aGk=",
          sizeBytes: 2,
          sha256: "1".repeat(64),
        },
      ],
    });
    const result = ok(Merge.build(inputs(recordEntry(t)), options()));
    const [a, b] = result.file.tests[0]?.attachments ?? [];
    expect(result.file.tests[0]?.title).toBe("leaked [REDACTED]");
    expect(Buffer.from(a?.content ?? "", "base64").toString()).toBe(
      "x [REDACTED] y",
    );
    expect(a?.sizeBytes).toBe(14);
    expect(a?.sha256).not.toBe("0".repeat(64));
    expect(b?.sha256).toBe("1".repeat(64));
  });
});
