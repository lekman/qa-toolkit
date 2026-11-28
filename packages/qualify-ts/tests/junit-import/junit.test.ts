import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { TestCase } from "../../src/evidence";

import { ImportError, JUnit } from "../../src/junit-import";

const FIXTURES = join(
  import.meta.dir,
  "../../../../spec/qualify/conformance/fixtures/junit",
);
const fixture = (name: string): string =>
  readFileSync(join(FIXTURES, name), "utf8");

const counts = (cases: readonly TestCase[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const c of cases) result[c.outcome] = (result[c.outcome] ?? 0) + 1;
  return result;
};

describe("JUnit.read: the runner samples", () => {
  test.each([
    ["bun.xml", { pass: 2, fail: 1, skip: 1 }, 1, undefined],
    ["vitest.xml", { pass: 2, fail: 2, skip: 1 }, 1, "2026-11-28T04:40:"],
    ["pytest.xml", { pass: 4, fail: 2, skip: 1 }, 0, "2026-11-28T04:27:22"],
    ["gradle-junit5.xml", { pass: 2, fail: 2, skip: 1 }, 1, "2026-11-28T04:"],
    ["xunit.xml", { pass: 2, fail: 2, skip: 1 }, 1, undefined],
  ] as const)("%s", (name, outcomes, ids, started) => {
    const report = JUnit.read(fixture(name), name, "UT");
    expect(counts(report.cases)).toEqual(outcomes);
    expect(report.cases.filter((c) => c.id === "OQ-AMOUNTS-001")).toHaveLength(
      ids,
    );
    for (const c of report.cases) {
      expect(c.level).toBe("UT");
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.outcome === "skip").toBe(c.skipReason !== undefined);
      expect(c.outcome === "fail").toBe(c.error !== undefined);
    }
    if (started === undefined) {
      expect(report.startedAt).toBeUndefined();
    } else {
      expect(new Date(report.startedAt as number).toISOString()).toStartWith(
        started.slice(0, 14),
      );
      expect(report.endedAt as number).toBeGreaterThanOrEqual(
        report.startedAt as number,
      );
    }
  });

  test("bun: nested suites, the file and a failure without a message", () => {
    const [first, , failed, skipped] = JUnit.read(
      fixture("bun.xml"),
      "bun.xml",
      "UT",
    ).cases as TestCase[];
    expect(first).toEqual({
      level: "UT",
      id: "OQ-AMOUNTS-001",
      suite: "tests/amounts.test.ts > amounts",
      classname: "amounts",
      name: "[OQ-AMOUNTS-001] parses an empty line as no amount",
      file: "tests/amounts.test.ts",
      outcome: "pass",
      durationMs: 0,
    });
    expect(failed?.error).toEqual({ type: "AssertionError", message: "" });
    expect(skipped?.skipReason).toBe("no reason given");
  });

  test("pytest: a message without a type, and a skip with a message", () => {
    const cases = JUnit.read(fixture("pytest.xml"), "p", "UT").cases;
    const failed = cases.find(
      (c) => c.name === "test_rejects_a_negative_amount",
    );
    expect(failed?.error?.type).toBe("failure");
    expect(failed?.error?.message).toBe("ValueError: negative amount");
    expect(failed?.error?.detail).toContain("amounts/__init__.py:10");
    expect(cases.find((c) => c.outcome === "skip")?.skipReason).toBe(
      "needs the rate service",
    );
  });

  test("gradle: the type and message of a JUnit 5 assertion", () => {
    const failed = JUnit.read(
      fixture("gradle-junit5.xml"),
      "g",
      "OQ",
    ).cases.find((c) => c.name === "comparesRounding()");
    expect(failed?.level).toBe("OQ");
    expect(failed?.classname).toBe("example.AmountsTest");
    expect(failed?.error?.type).toBe("org.opentest4j.AssertionFailedError");
    expect(failed?.error?.message).toContain(
      "expected: <1.24> but was: <1.23>",
    );
  });
});

describe("JUnit.read: rules", () => {
  test("an error element, the first result wins, and a message from the text", () => {
    const { cases } = JUnit.read(
      `<testsuite name="s" file="s.py">
        <testcase name="a" time="1.2345"><error>boom
at line 3</error><skipped/></testcase>
        <testcase name="b" time="soon"><skipped>later</skipped></testcase>
        <testcase name="c" file="own.py" time="-1"/>
      </testsuite>`,
      "x.xml",
      "UT",
    );
    expect(cases.map((c) => [c.outcome, c.durationMs, c.file])).toEqual([
      ["error", 1235, "s.py"],
      ["skip", 0, "s.py"],
      ["pass", 0, "own.py"],
    ]);
    expect(cases[0]?.error).toEqual({
      type: "error",
      message: "boom",
      detail: "boom\nat line 3",
    });
    expect(cases[1]?.skipReason).toBe("later");
    expect(cases[0]?.classname).toBeNull();
  });

  test("redacts the pattern rules in every string", () => {
    const key = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
    const { cases } = JUnit.read(
      `<testsuites><testsuite name="${key}"><testcase name="uses ${key}" classname="${key}"><failure message="${key}" type="${key}">${key}</failure></testcase></testsuite></testsuites>`,
      "x.xml",
      "UT",
    );
    expect(JSON.stringify(cases)).not.toContain(key);
    expect(cases[0]?.name).toBe("uses [REDACTED]");
  });

  test("a root without suites and a suite without a name", () => {
    expect(JUnit.read("<testsuites/>", "x", "UT").cases).toEqual([]);
    const { cases } = JUnit.read(
      '<testsuites><testsuite><testcase name="a"/></testsuite></testsuites>',
      "x",
      "UT",
    );
    expect(cases[0]?.suite).toBe("");
  });

  test.each([
    ["<report/>", "the root element is <report>"],
    ['<testsuite><testcase name=" "/></testsuite>', "without a name"],
  ])("%p is an input error", (xml, message) => {
    expect(() => JUnit.read(xml, "x.xml", "UT")).toThrow(ImportError);
    expect(() => JUnit.read(xml, "x.xml", "UT")).toThrow(message);
  });

  test.each([
    ["[OQ-EXPORT-003] keeps amounts", "OQ-EXPORT-003"],
    ["amounts > IU-CHECKOUT-012 pays", "IU-CHECKOUT-012"],
    ["test_oq_export_003", undefined],
    ["XOQ-EXPORT-003 touches a letter", undefined],
    ["OQ-EXPORT-0031x", undefined],
    ["OQ-EXPORT-API-001 has two areas", undefined],
    ["UT-PARSER-001 is not a qualify ID", undefined],
  ])("the ID in %p", (name, id) => {
    expect(JUnit.id(name)).toBe(id);
  });

  test("timestamps: a zone, no zone as UTC, and nonsense", () => {
    expect(JUnit.timestamp("2026-01-02T03:04:05+01:00")).toBe(
      Date.UTC(2026, 0, 2, 2, 4, 5),
    );
    expect(JUnit.timestamp("2026-01-02T03:04:05")).toBe(
      Date.UTC(2026, 0, 2, 3, 4, 5),
    );
    expect(JUnit.timestamp("yesterday")).toBeUndefined();
    expect(JUnit.timestamp(undefined)).toBeUndefined();
  });

  test("the span runs from the earliest suite start to the latest end", () => {
    const report = JUnit.read(
      `<testsuites>
        <testsuite name="a" timestamp="2026-01-02T03:04:05Z" time="10"/>
        <testsuite name="b" timestamp="2026-01-02T03:04:00Z" time="1.5"/>
      </testsuites>`,
      "x",
      "UT",
    );
    expect(report.startedAt).toBe(Date.UTC(2026, 0, 2, 3, 4, 0));
    expect(report.endedAt).toBe(Date.UTC(2026, 0, 2, 3, 4, 15));
  });
});
