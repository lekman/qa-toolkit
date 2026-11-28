import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImportError, Lcov } from "../../src/junit-import";

const FIXTURES = join(
  import.meta.dir,
  "../../../../spec/qualify/conformance/fixtures/junit",
);
const fixture = (name: string): string =>
  readFileSync(join(FIXTURES, name), "utf8");

describe("Lcov: the runner samples", () => {
  test("pytest-cov: lines, functions and branches from their records", () => {
    const coverage = Lcov.coverage(
      Lcov.parse(fixture("pytest.lcov.info"), "p"),
      "/work",
    );
    expect(coverage.files).toEqual([
      {
        path: "amounts/__init__.py",
        lines: { found: 15, hit: 13, percent: 86.67 },
        functions: { found: 3, hit: 3, percent: 100 },
        branches: { found: 8, hit: 6, percent: 75 },
      },
    ]);
  });

  test("bun: lines from DA, functions from the FNF and FNH totals", () => {
    const coverage = Lcov.coverage(
      Lcov.parse(fixture("bun.lcov.info"), "b"),
      "/work",
    );
    expect(coverage.totals).toEqual({
      lines: { found: 10, hit: 7, percent: 70 },
      functions: { found: 3, hit: 2, percent: 66.67 },
      branches: { found: 0, hit: 0, percent: null },
    });
  });

  test("totals add up every file", () => {
    const records = [
      ...Lcov.parse(fixture("pytest.lcov.info"), "p"),
      ...Lcov.parse(fixture("bun.lcov.info"), "b"),
    ];
    const { totals, files } = Lcov.coverage(records, "/work");
    expect(files.map((f) => f.path)).toEqual([
      "amounts/__init__.py",
      "src/amounts.ts",
    ]);
    expect(totals.lines).toEqual({ found: 25, hit: 20, percent: 80 });
    expect(totals.functions).toEqual({ found: 6, hit: 5, percent: 83.33 });
    expect(totals.branches).toEqual({ found: 8, hit: 6, percent: 75 });
  });
});

describe("Lcov: rules", () => {
  test("a file in several records adds its counts per item", () => {
    const records = Lcov.parse(
      `SF:/work/src/a.ts
FN:1,run
FN:5,9,helper
FNDA:0,run
DA:1,0
DA:2,1
BRDA:3,0,0,-
BRDA:3,0,1,2
end_of_record
SF:src/a.ts
FNA:0,1,run
DA:1,3
BRDA:3,0,0,1
end_of_record`,
      "a.info",
    );
    const [file] = Lcov.coverage(records, "/work").files;
    expect(file).toEqual({
      path: "src/a.ts",
      lines: { found: 2, hit: 2, percent: 100 },
      functions: { found: 2, hit: 1, percent: 50 },
      branches: { found: 2, hit: 2, percent: 100 },
    });
  });

  test("totals-only records take the larger found and hit", () => {
    const records = Lcov.parse(
      "SF:a\nLF:10\nLH:4\nend_of_record\nSF:a\nLF:8\nLH:6\nend_of_record\n",
      "a.info",
    );
    expect(Lcov.coverage(records, "/work").files[0]?.lines).toEqual({
      found: 10,
      hit: 6,
      percent: 60,
    });
  });

  test("a last record without end_of_record still counts, and unknown lines are skipped", () => {
    const records = Lcov.parse(
      "TN:x\n# note\nSF:a\nVER:2\nDA:1,1\n\nSF:b\nDA:1,0",
      "a.info",
    );
    expect(records.map((r) => r.path)).toEqual(["a", "b"]);
  });

  test("paths outside the working directory stay as written", () => {
    expect(Lcov.path("/work/src/a.ts", "/work")).toBe("src/a.ts");
    expect(Lcov.path("/elsewhere/a.ts", "/work")).toBe("/elsewhere/a.ts");
    expect(Lcov.path("src\\a.ts", "/work")).toBe("src/a.ts");
    expect(Lcov.path("/work", "/work")).toBe("/work");
  });

  test("percent has two decimals and is null when nothing was found", () => {
    expect(Lcov.counter(3, 1).percent).toBe(33.33);
    expect(Lcov.counter(3, 2).percent).toBe(66.67);
    expect(Lcov.counter(0, 0).percent).toBeNull();
  });

  test.each([
    ["DA:1,1\n", "DA before an SF line"],
    ["SF:a\nDA:x,1\n", "DA:x,1 is not a valid record"],
    ["SF:a\nDA:1,-2\n", "DA:1,-2 is not a valid record"],
    ["SF:a\nBRDA:1,0\n", "BRDA:1,0 is not a valid record"],
    ["SF:a\nFN:1\n", "FN:1 is not a valid record"],
    ["SF:a\nFNDA:1\n", "FNDA:1 is not a valid record"],
    ["SF:a\nFNA:0,1\n", "FNA:0,1 is not a valid record"],
    ["SF:a\nLF:2\nLH:3\nend_of_record\n", "states more lines hit than found"],
  ])("%p is an input error", (text, message) => {
    expect(() => Lcov.parse(text, "c.info")).toThrow(ImportError);
    expect(() => Lcov.parse(text, "c.info")).toThrow(message);
  });
});
