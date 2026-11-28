import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { RunFile } from "../../src/evidence";

import { extractPdf, missingFromOutline } from "../../conformance/pdf-text";
import { Commands, EXIT } from "../../src/cli";
import { MemoryCliIO } from "../mocks/memory.mock";

const JUNIT = join(
  import.meta.dir,
  "../../../../spec/qualify/conformance/fixtures/junit",
);
const at = (name: string): string => join(JUNIT, name);
const LCOV = [
  "--coverage",
  at("pytest.lcov.info"),
  "--coverage",
  at("bun.lcov.info"),
];

const imported = async (
  io: MemoryCliIO,
  args: string[],
  code: number = EXIT.failed,
): Promise<RunFile> => {
  expect(await Commands.run(["import", "junit", ...args], io)).toBe(code);
  return JSON.parse(io.text("/work/test-evidence.json")) as RunFile;
};

describe("Commands: import junit", () => {
  test("writes the run file, its sidecar and a summary line", async () => {
    const io = new MemoryCliIO(
      {},
      { QUALIFY_ENVIRONMENT: "ci", QUALIFY_TARGET_VERSION: "1.2.3" },
    );
    const file = await imported(io, [at("pytest.xml"), ...LCOV]);
    const text = io.text("/work/test-evidence.json");
    expect(io.text("/work/test-evidence.json.sha256")).toBe(
      `${createHash("sha256").update(text).digest("hex")}  test-evidence.json\n`,
    );
    expect(file.run.environment).toBe("ci");
    expect(file.run.target).toEqual({ version: "1.2.3" });
    expect(file.run.source.branch).toBe("main");
    expect(file.run.tool.runtime).toBe("node 22.0.0; qualify import junit");
    expect(Object.keys(file)).toEqual([
      "schemaVersion",
      "kind",
      "run",
      "summary",
      "tests",
      "imported",
      "cases",
      "coverage",
    ]);
    expect(io.out.join("")).toBe(
      "qualify import junit: 7 tests, 4 pass, 2 fail, 0 error, 1 skip; line coverage 80.00%; verdict fail; wrote /work/test-evidence.json\n",
    );
    expect(await Commands.run(["validate", "test-evidence.json"], io)).toBe(
      EXIT.ok,
    );
  });

  test("--level, --out, a lower-case level and several files", async () => {
    const io = new MemoryCliIO();
    expect(
      await Commands.run(
        [
          "import",
          "junit",
          at("bun.xml"),
          at("xunit.xml"),
          "--level",
          "oq",
          "--out",
          "out/unit.json",
        ],
        io,
      ),
    ).toBe(EXIT.failed);
    const file = JSON.parse(io.text("/work/out/unit.json")) as RunFile;
    expect(file.cases?.length).toBe(9);
    expect(new Set(file.cases?.map((c) => c.level))).toEqual(new Set(["OQ"]));
    expect(io.out.join("")).not.toContain("coverage");
  });

  test("a passing report exits 0", async () => {
    const io = new MemoryCliIO({
      "/work/ok.xml": '<testsuite name="s"><testcase name="t"/></testsuite>',
    });
    const file = await imported(io, ["ok.xml"], EXIT.ok);
    expect(file.summary.verdict).toBe("pass");
  });

  test.each([
    [["import"]],
    [["import", "xml"]],
    [["import", "junit"]],
    [["import", "junit", "a.xml", "--level", "IT"]],
    [["import", "junit", "a.xml", "--bogus"]],
  ])("%p is a usage error", async (argv) => {
    const io = new MemoryCliIO();
    expect(await Commands.run(argv, io)).toBe(EXIT.usage);
    expect(io.err.join("")).toContain("qualify import junit");
  });

  test.each([
    ["missing.xml", {}],
    ["bad.xml", { "/work/bad.xml": "<testsuite>" }],
    ["ok.xml", { "/work/ok.xml": "<testsuite/>", "/work/c.info": "DA:1,1" }],
  ])("%s: invalid input exits 2 and writes nothing", async (name, files) => {
    const io = new MemoryCliIO(files as Record<string, string>);
    expect(
      await Commands.run(
        [
          "import",
          "junit",
          name,
          ...(name === "ok.xml" ? ["--coverage", "c.info"] : []),
        ],
        io,
      ),
    ).toBe(EXIT.invalid);
    expect(io.files.has("/work/test-evidence.json")).toBe(false);
  });
});

describe("Commands: report of an imported run", () => {
  test.each([
    ["bun.xml", "rejects a negative amount"],
    ["vitest.xml", "amounts > currency > names the euro"],
    ["pytest.xml", "test_dollar_lookup_raises"],
    ["gradle-junit5.xml", "comparesRounding()"],
    ["xunit.xml", "Sample.Tests.AmountsTests.ComparesRounding"],
  ])(
    "%s: coverage totals, the file table and the failed cases",
    async (name, failed) => {
      const io = new MemoryCliIO(
        {},
        { QUALIFY_REPORT_TIME: "2026-01-02T03:04:05.006Z" },
      );
      await imported(io, [at(name), ...LCOV]);
      expect(
        await Commands.run(
          ["report", "test-evidence.json", "--pdf", "r.pdf", "--no-signatures"],
          io,
        ),
      ).toBe(EXIT.ok);
      const pdf = await extractPdf(io.files.get("/work/r.pdf") as Uint8Array);
      expect(
        missingFromOutline(pdf.lines, [
          "Imported",
          "Summary",
          "UT",
          "Coverage",
          "Lines 25 20 80.00%",
          "Functions 6 5 83.33%",
          "Branches 8 6 75.00%",
          "Coverage by file",
          "src/amounts.ts 70.00% (7/10) 66.67% (2/3) -",
          "amounts/__init__.py 86.67% (13/15) 100.00% (3/3) 75.00% (6/8)",
          "Failed test cases",
          failed,
          "Test cases",
        ]),
      ).toBeUndefined();
    },
  );

  test("a case with a qualify ID is a trace row, and the plain theme applies", async () => {
    const io = new MemoryCliIO(
      { "/work/trace.yaml": "OQ-AMOUNTS-001: AMOUNTS-1\n" },
      { QUALIFY_REPORT_THEME: "plain" },
    );
    await imported(io, [at("gradle-junit5.xml")]);
    expect(
      await Commands.run(
        [
          "report",
          "test-evidence.json",
          "--pdf",
          "r.pdf",
          "--map",
          "trace.yaml",
        ],
        io,
      ),
    ).toBe(EXIT.ok);
    expect(io.out.join("")).toContain("with theme plain");
    const pdf = await extractPdf(io.files.get("/work/r.pdf") as Uint8Array);
    const text = pdf.lines.join("\n");
    expect(text).toContain("AMOUNTS-1 (map)");
    expect(text).not.toContain("lekman.com");
    expect(text).toContain("None");
    expect(text).not.toContain("Coverage by file");
  });
});
