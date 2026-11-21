import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { RunFile } from "../../src/evidence";
import type { TraceFile } from "../../src/trace";

import { extractPdf, missingFromOutline } from "../../conformance/pdf-text";
import { Commands, EXIT } from "../../src/cli";
import { Runtime } from "../../src/execution";
import {
  envelope,
  markerEntry,
  OTHER_RUN,
  recordEntry,
  RUN_ID,
  testRecord,
} from "../mocks/evidence.mock";
import { MemoryCliIO } from "../mocks/memory.mock";
import { FIXTURES } from "../mocks/theme.mock";

const DIR = "/work/qualification/evidence";

const withRecords = (...entries: [string, string][]): MemoryCliIO =>
  new MemoryCliIO(
    Object.fromEntries(
      entries.map(([name, text]) => [`${DIR}/records/${name}`, text]),
    ),
  );

const merged = async (io: MemoryCliIO): Promise<string> => {
  expect(await Commands.run(["merge"], io)).toBe(EXIT.ok);
  return io.text(`${DIR}/test-evidence.json`);
};

describe("Commands: help, version and usage", () => {
  test("help and version", async () => {
    const io = new MemoryCliIO();
    expect(await Commands.run(["--help"], io)).toBe(0);
    expect(io.out.join("")).toContain("qualify merge");
    expect(await Commands.run(["-v"], io)).toBe(0);
    expect(io.out.at(-1)).toBe(`${Runtime.TOOL_VERSION}\n`);
  });

  test.each([
    [[]],
    [["run"]],
    [["merge", "extra"]],
    [["merge", "--bogus"]],
    [["merge", "--allow-runs", "nope"]],
    [["validate"]],
    [["trace"]],
  ])("%p is a usage error", async (argv) => {
    const io = new MemoryCliIO();
    expect(await Commands.run(argv, io)).toBe(EXIT.usage);
    expect(io.err.join("")).toContain("Usage:");
  });

  test("unexpected errors are not swallowed", async () => {
    const io = new MemoryCliIO();
    io.list = async () => {
      throw new Error("EACCES");
    };
    expect(await Commands.run(["merge"], io)).toBe(EXIT.invalid);
    io.readBytes = async () => {
      throw new Error("EIO");
    };
    expect(await Commands.run(["validate", "x.json"], io)).toBe(EXIT.invalid);
  });
});

describe("Commands: merge", () => {
  test("writes the run file and its sidecar", async () => {
    const t = testRecord("OQ-A1-001");
    const io = withRecords(recordEntry(t), markerEntry(t));
    const text = await merged(io);
    const file = JSON.parse(text) as RunFile;
    expect(file.summary.verdict).toBe("pass");
    expect(io.text(`${DIR}/test-evidence.json.sha256`)).toBe(
      `${createHash("sha256").update(text).digest("hex")}  test-evidence.json\n`,
    );
    expect(io.out.join("")).toContain("1 tests, 1 pass");
  });

  test("--evidence-dir, --out and --allow-runs", async () => {
    const io = new MemoryCliIO({
      [`/other/records/${recordEntry(testRecord("OQ-A1-001"))[0]}`]:
        recordEntry(testRecord("OQ-A1-001"))[1],
      [`/other/records/${recordEntry(testRecord("OQ-A1-002"), envelope({ id: OTHER_RUN }))[0]}`]:
        recordEntry(testRecord("OQ-A1-002"), envelope({ id: OTHER_RUN }))[1],
    });
    expect(
      await Commands.run(
        ["merge", "--evidence-dir", "/other", "--out", "run.json"],
        io,
      ),
    ).toBe(EXIT.invalid);
    expect(io.err.join("")).toContain("more than one run");
    expect(
      await Commands.run(
        [
          "merge",
          "--evidence-dir",
          "/other",
          "--out",
          "run.json",
          "--allow-runs",
          OTHER_RUN,
        ],
        io,
      ),
    ).toBe(0);
    expect(
      (JSON.parse(io.text("/work/run.json")) as RunFile).run.mergedRuns,
    ).toEqual([OTHER_RUN]);
    expect(io.text("/work/run.json.sha256")).toEndWith("  run.json\n");
  });

  test("QUALIFY_EVIDENCE_DIR and an empty directory", async () => {
    const io = new MemoryCliIO(
      {},
      { QUALIFY_EVIDENCE_DIR: "/env-dir", QUALIFY_RUN_ID: RUN_ID },
    );
    expect(await Commands.run(["merge"], io)).toBe(EXIT.incomplete);
    const file = JSON.parse(io.text("/env-dir/test-evidence.json")) as RunFile;
    expect(file.run.id).toBe(RUN_ID);
    expect(file.run.tool.runtime).toBe("node 22.0.0; qualify merge");
    const fresh = new MemoryCliIO();
    expect(await Commands.run(["merge"], fresh)).toBe(EXIT.incomplete);
    expect(
      (JSON.parse(fresh.text(`${DIR}/test-evidence.json`)) as RunFile).run.id,
    ).toMatch(/^[0-9A-Z]{26}$/);
  });

  test("an invalid input writes nothing and exits 2", async () => {
    const io = withRecords(["bad.json", "{}"]);
    expect(await Commands.run(["merge"], io)).toBe(EXIT.invalid);
    expect(io.err.join("")).toContain("no run file written");
    expect(io.files.has(`${DIR}/test-evidence.json`)).toBe(false);
  });

  test("a failed test exits 1", async () => {
    const io = withRecords(
      recordEntry(
        testRecord("OQ-A1-001", {
          outcome: "fail",
          error: { type: "CheckFailed", message: "m", site: null },
        }),
      ),
    );
    expect(await Commands.run(["merge"], io)).toBe(EXIT.failed);
  });
});

describe("Commands: validate", () => {
  test("valid files, a broken one, a trace and a sidecar", async () => {
    const t = testRecord("OQ-A1-001");
    const io = withRecords(recordEntry(t));
    const run = await merged(io);
    io.files.set("/work/bad.json", "{");
    io.files.set(
      "/work/level.json",
      run.replace('"level": "OQ"', '"level": "PQ"'),
    );
    expect(
      await Commands.run(
        [
          "validate",
          `${DIR}/test-evidence.json`,
          `${DIR}/records/${recordEntry(t)[0]}`,
        ],
        io,
      ),
    ).toBe(0);
    expect(await Commands.run(["validate", "bad.json"], io)).toBe(EXIT.invalid);
    expect(await Commands.run(["validate", "missing.json"], io)).toBe(
      EXIT.invalid,
    );
    expect(await Commands.run(["validate", "level.json"], io)).toBe(
      EXIT.invalid,
    );
    expect(io.err.join("")).toContain("does not match its level PQ");
    io.files.set(
      `${DIR}/test-evidence.json.sha256`,
      `${"0".repeat(64)}  test-evidence.json\n`,
    );
    expect(
      await Commands.run(["validate", `${DIR}/test-evidence.json`], io),
    ).toBe(EXIT.invalid);
    expect(io.err.join("")).toContain("SHA-256 does not match");

    expect(
      await Commands.run(["trace", `${DIR}/records/${recordEntry(t)[0]}`], io),
    ).toBe(EXIT.invalid);
  });
});

describe("Commands: trace", () => {
  const setup = async (): Promise<MemoryCliIO> => {
    const io = withRecords(
      recordEntry(testRecord("OQ-A1-001", { requirements: ["R1"] })),
    );
    await merged(io);
    io.files.set(
      "/work/protocol.yaml",
      "tests:\n  - {id: OQ-A1-001, title: T, level: OQ}\n  - {id: OQ-A1-002, title: U, level: OQ}\n",
    );
    io.files.set("/work/trace.yaml", "OQ-A1-001: R2\n");
    return io;
  };

  test("writes trace.md and trace.json and exits by the matrix", async () => {
    const io = await setup();
    const code = await Commands.run(
      [
        "trace",
        `${DIR}/test-evidence.json`,
        "--protocol",
        "protocol.yaml",
        "--map",
        "trace.yaml",
        "--md",
        "out/trace.md",
        "--json",
        "out/trace.json",
      ],
      io,
    );
    expect(code).toBe(EXIT.incomplete);
    const trace = JSON.parse(io.text("/work/out/trace.json")) as TraceFile;
    expect(trace.notRun).toEqual(["OQ-A1-002"]);
    expect(trace.inputs.map((i) => i.path)).toEqual([
      `${DIR}/test-evidence.json`,
      "protocol.yaml",
      "trace.yaml",
    ]);
    expect(io.text("/work/out/trace.md")).toContain("# Trace Matrix");
    expect(io.err.join("")).toContain("verdict incomplete");
  });

  test("prints Markdown without --md or --json", async () => {
    const io = await setup();
    expect(await Commands.run(["trace", `${DIR}/test-evidence.json`], io)).toBe(
      0,
    );
    expect(io.out.join("")).toContain("| R1 (code) | OQ-A1-001 |");
  });

  test("invalid inputs exit 2", async () => {
    const io = await setup();
    io.files.set("/work/broken.yaml", "tests: [");
    expect(
      await Commands.run(
        ["trace", `${DIR}/test-evidence.json`, "--protocol", "broken.yaml"],
        io,
      ),
    ).toBe(EXIT.invalid);
    expect(
      await Commands.run(
        ["trace", `${DIR}/test-evidence.json`, `${DIR}/test-evidence.json`],
        io,
      ),
    ).toBe(EXIT.invalid);
    expect(io.err.join("")).toContain("given twice");
    io.files.set("/work/schema-bad.json", "{}");
    expect(await Commands.run(["trace", "schema-bad.json"], io)).toBe(
      EXIT.invalid,
    );
  });
});

describe("Commands: report", () => {
  const setup = async (
    env: Record<string, string> = {},
  ): Promise<MemoryCliIO> => {
    const failed = testRecord("OQ-A1-001", {
      requirements: ["R1"],
      outcome: "fail",
      error: { type: "CheckFailed", message: "c: d", site: null },
    });
    const source = withRecords(recordEntry(failed));
    expect(await Commands.run(["merge"], source)).toBe(EXIT.failed);
    const io = new MemoryCliIO(
      {
        "/work/run.json": source.text(`${DIR}/test-evidence.json`),
        "/work/protocol.yaml":
          "tests:\n  - {id: OQ-A1-002, title: Later, level: OQ}\n",
        "/work/trace.yaml": "OQ-A1-001: R2\n",
      },
      env,
    );
    return io;
  };

  test("writes a PDF with the default theme and exits 0 although the run failed", async () => {
    const io = await setup({ QUALIFY_REPORT_TIME: "2026-01-02T03:04:05.006Z" });
    const code = await Commands.run(
      [
        "report",
        "run.json",
        "--pdf",
        "out/report.pdf",
        "--protocol",
        "protocol.yaml",
        "--map",
        "trace.yaml",
        "--title",
        "T {not a token}",
        "--subtitle",
        "Sub",
        "--document-id",
        "D-1",
        "--classification",
        "Secret",
        "--signatures",
        "Owner; QA",
      ],
      io,
    );
    expect(code).toBe(EXIT.ok);
    const pdf = await extractPdf(
      io.files.get("/work/out/report.pdf") as Uint8Array,
    );
    expect(pdf.info.Title).toBe("T {not a token}");
    expect(String(pdf.info.CreationDate)).toStartWith("D:20260102030405");
    expect(
      missingFromOutline(pdf.lines, [
        "lekman.com",
        "T {not a token}",
        "Sub",
        "D-1",
        "Failed",
        "Secret",
        "T {not a token} Secret",
        "R1 (code)",
        "R2 (map)",
        "Not run",
        "OQ-A1-002 Later",
        "Owner",
        "QA",
      ]),
    ).toBeUndefined();
    expect(io.out.join("")).toContain("with theme lekman; run verdict fail");
  });

  test("--theme wins over QUALIFY_REPORT_THEME; --no-signatures; the current time", async () => {
    const io = await setup({ QUALIFY_REPORT_THEME: "lekman" });
    expect(
      await Commands.run(
        [
          "report",
          "run.json",
          "--pdf",
          "r.pdf",
          "--theme",
          "plain",
          "--no-signatures",
        ],
        io,
      ),
    ).toBe(0);
    const pdf = await extractPdf(io.files.get("/work/r.pdf") as Uint8Array);
    const text = pdf.lines.join("\n");
    expect(text).not.toContain("lekman.com");
    expect(text).not.toContain("Prepared by");
    expect(text).toContain("2026-01-02 03:04:05 UTC");
    const fromEnv = await setup({ QUALIFY_REPORT_THEME: "plain" });
    expect(
      await Commands.run(["report", "run.json", "--pdf", "r.pdf"], fromEnv),
    ).toBe(0);
    expect(fromEnv.out.join("")).toContain("with theme plain");
  });

  test("an invalid theme exits 2 and writes no PDF", async () => {
    const io = await setup();
    const bad = join(FIXTURES, "bad-theme", "theme.json");
    expect(
      await Commands.run(
        ["report", "run.json", "--pdf", "r.pdf", "--theme", bad],
        io,
      ),
    ).toBe(EXIT.invalid);
    expect(io.err.join("")).toContain("{nope}");
    expect(io.files.has("/work/r.pdf")).toBe(false);
    expect(
      await Commands.run(
        ["report", "run.json", "--pdf", "r.pdf", "--theme", "missing"],
        io,
      ),
    ).toBe(EXIT.invalid);
  });

  test.each([
    [["report", "--pdf", "r.pdf"]],
    [["report", "a.json", "b.json", "--pdf", "r.pdf"]],
    [["report", "run.json"]],
    [
      [
        "report",
        "run.json",
        "--pdf",
        "r.pdf",
        "--signatures",
        "A",
        "--no-signatures",
      ],
    ],
    [["report", "run.json", "--pdf", "r.pdf", "--signatures", " ; "]],
    [["report", "run.json", "--pdf", "r.pdf", "--title", " "]],
    [["report", "run.json", "--pdf", "r.pdf", "--theme", ""]],
  ])("%p is a usage error", async (argv) => {
    const io = await setup();
    expect(await Commands.run(argv, io)).toBe(EXIT.usage);
  });

  test("invalid input exits 2", async () => {
    const io = await setup({ QUALIFY_REPORT_TIME: "yesterday" });
    expect(
      await Commands.run(["report", "run.json", "--pdf", "r.pdf"], io),
    ).toBe(EXIT.invalid);
    expect(io.err.join("")).toContain("QUALIFY_REPORT_TIME");
    const record = await setup();
    record.files.set(
      "/work/record.json",
      recordEntry(testRecord("OQ-A1-001"))[1],
    );
    expect(
      await Commands.run(["report", "record.json", "--pdf", "r.pdf"], record),
    ).toBe(EXIT.invalid);
    expect(record.files.has("/work/r.pdf")).toBe(false);
  });
});
