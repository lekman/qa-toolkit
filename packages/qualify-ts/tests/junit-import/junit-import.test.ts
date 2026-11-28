import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ImportSource } from "../../src/junit-import";

import { JUnitImport } from "../../src/junit-import";
import { Schema } from "../../src/schema";
import { envelope } from "../mocks/evidence.mock";

const FIXTURES = join(
  import.meta.dir,
  "../../../../spec/qualify/conformance/fixtures/junit",
);
const source = (name: string): ImportSource => ({
  path: `results/${name}`,
  sha256: "a".repeat(64),
  text: readFileSync(join(FIXTURES, name), "utf8"),
});
const NOW = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6));

const build = (junit: ImportSource[], coverage: ImportSource[] = []) =>
  JUnitImport.build({
    junit,
    coverage,
    level: "UT",
    cwd: "/work",
    envelope: envelope(),
    now: NOW,
  });

describe("JUnitImport.build", () => {
  test.each([
    "bun.xml",
    "vitest.xml",
    "pytest.xml",
    "gradle-junit5.xml",
    "xunit.xml",
  ])("%s with coverage is a valid run file", (name) => {
    const { file, exitCode } = build(
      [source(name)],
      [source("pytest.lcov.info"), source("bun.lcov.info")],
    );
    expect(Schema.evidence(file)).toEqual([]);
    expect(exitCode).toBe(1);
    expect(file.tests).toEqual([]);
    expect(file.summary.total).toBe(file.cases?.length as number);
    expect(file.summary.verdict).toBe("fail");
    expect(file.coverage?.totals.lines.percent).toBe(80);
    expect(file.imported?.map((i) => i.kind)).toEqual([
      "junit",
      "lcov",
      "lcov",
    ]);
  });

  test("several reports keep their order and share one span", () => {
    const { file } = build([source("pytest.xml"), source("gradle-junit5.xml")]);
    expect(file.cases?.length).toBe(12);
    expect(file.cases?.[0]?.suite).toBe("pytest");
    expect(file.cases?.at(-1)?.classname).toBe("example.AmountsTest");
    expect(file.run.startedAt).toBe("2026-11-28T04:27:22.592Z");
    expect(file.run.endedAt).toBe("2026-11-28T04:32:14.934Z");
    expect(file.coverage).toBeUndefined();
  });

  test("without timestamps the run starts and ends at the import time", () => {
    const { file } = build([source("xunit.xml")]);
    expect(file.run.startedAt).toBe(NOW.toISOString());
    expect(file.run.endedAt).toBe(NOW.toISOString());
  });

  test("exit 0 when every case passed, 3 when there are none", () => {
    const pass = {
      path: "p.xml",
      sha256: "b".repeat(64),
      text: '<testsuite name="s"><testcase name="t"/></testsuite>',
    };
    expect(build([pass]).exitCode).toBe(0);
    const empty = { ...pass, text: "<testsuites/>" };
    const result = build([empty]);
    expect(result.exitCode).toBe(3);
    expect(result.file.summary.verdict).toBe("incomplete");
    expect(Schema.evidence(result.file)).toEqual([]);
  });
});
