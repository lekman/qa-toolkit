import { TestSets } from "@lekman/test-sets";
import { describe, expect, test } from "bun:test";

import { QaPlan } from "../../src/plan";
import { ConsoleReport } from "../../src/report";
import { QaRun } from "../../src/run";
import { FilesMock, ProcessMock } from "../mocks/ports";

const FILE = TestSets.parse(`version: 1
sets:
  - { name: unit, level: unit, runner: vitest, paths: [app] }
  - { name: jvm, level: unit, runner: gradle, paths: [svc] }
  - { name: iu, level: IU, runner: cucumber-js, paths: [web] }
  - { name: gone, level: unit, runner: pytest, paths: [py] }
`).file as NonNullable<ReturnType<typeof TestSets.parse>["file"]>;

const plan = QaPlan.build({
  file: FILE,
  filter: {},
  folders: ["app", "svc", "web", "py"],
  index: new Map(),
  out: "/r/out",
  platform: "linux",
  root: "/r",
  runId: "01JZ0000000000000000000000",
});

const OPTIONS = {
  dryRun: false,
  out: "/r/out",
  platform: "linux",
  qualify: "qualify",
  report: true,
  root: "/r",
};

const junit = (failures: number) =>
  `<testsuites><testsuite name="s"><testcase name="a"/>${failures > 0 ? '<testcase name="b"><failure message="no"/></testcase>' : ""}</testsuite></testsuites>`;

describe("QaRun", () => {
  test("runs each set, reads JUnit XML and qualify evidence, merges and summarises", async () => {
    let now = 10_000;
    const files = new FilesMock(
      new Map([
        ["/r/out/junit/unit-app.xml", { mtime: 10_000, text: junit(1) }],
        [
          "/r/svc/build/test-results/test/TEST-a.xml",
          { mtime: 10_000, text: junit(0) },
        ],
        [
          "/r/svc/build/test-results/test/TEST-old.xml",
          { mtime: 1, text: junit(1) },
        ],
        [
          "/r/svc/build/test-results/test/other.xml",
          { mtime: 10_000, text: junit(1) },
        ],
        [
          "/r/out/evidence/iu/web/test-evidence.json",
          {
            mtime: 10_000,
            text: JSON.stringify({
              kind: "run",
              summary: {
                error: 0,
                fail: 0,
                pass: 2,
                skip: 0,
                total: 2,
                verdict: "pass",
              },
            }),
          },
        ],
      ]),
    );
    const process = new ProcessMock((c) =>
      c.startsWith("bunx vitest") || c.startsWith("npx vitest") ? 1 : 0,
    );
    const lines: string[] = [];
    const outcome = await QaRun.execute(plan.runs, OPTIONS, {
      clock: () => (now += 500),
      files,
      log: (l) => lines.push(l),
      process,
    });
    expect(files.resets).toEqual(["/r/out"]);
    expect(outcome.exitCode).toBe(1);
    expect(
      outcome.results.map((r) => [
        r.set,
        r.status,
        r.summary.tests,
        r.summary.failures,
        r.note ?? "",
      ]),
    ).toEqual([
      ["unit", "fail", 2, 1, ""],
      ["jvm", "pass", 1, 0, ""],
      ["iu", "pass", 2, 0, ""],
      [
        "gone",
        "fail",
        0,
        0,
        "the command exited with 0 and left no JUnit XML at /r/out/junit/gone-py.xml",
      ],
    ]);
    expect(outcome.results[2]?.report).toBe("/r/out/reports/iu-web.pdf");
    expect(process.commands.map((c) => c.command)).toContain(
      "qualify merge --evidence-dir '/r/out/evidence/iu/web' --out '/r/out/evidence/iu/web/test-evidence.json'",
    );
    expect(process.commands.map((c) => c.command)).toContain(
      "qualify report '/r/out/evidence/iu/web/test-evidence.json' --pdf '/r/out/reports/iu-web.pdf'",
    );
    const merged = files.files.get("/r/out/junit.xml")?.text ?? "";
    expect(merged).toContain('<testsuites tests="4" failures="1" errors="1"');
    expect(
      JSON.parse(files.files.get("/r/out/summary.json")?.text ?? "{}").results,
    ).toHaveLength(4);
    expect(lines[0]).toStartWith("\n▶ unit (app): ");
    const table = ConsoleReport.results(outcome.results);
    expect(table[table.length - 1]).toBe("2 of 4 failed");
  });

  test("a qualification set without a run file fails with the reason; a failed verdict fails", async () => {
    const iu = plan.runs.filter((r) => r.set.name === "iu");
    const none = await QaRun.execute(
      iu,
      { ...OPTIONS, report: false },
      {
        clock: () => 0,
        files: new FilesMock(),
        log: () => undefined,
        process: new ProcessMock(() => 3),
      },
    );
    expect(none.results[0]?.note).toBe(
      "qualify merge exited with 3 and wrote no run file",
    );
    const failed = new FilesMock(
      new Map([
        [
          "/r/out/evidence/iu/web/test-evidence.json",
          {
            mtime: 0,
            text: JSON.stringify({
              kind: "run",
              summary: {
                error: 1,
                fail: 0,
                pass: 0,
                skip: 0,
                total: 1,
                verdict: "fail",
              },
            }),
          },
        ],
      ]),
    );
    const outcome = await QaRun.execute(
      iu,
      { ...OPTIONS, report: false },
      {
        clock: () => 0,
        files: failed,
        log: () => undefined,
        process: new ProcessMock(() => 0),
      },
    );
    expect(outcome.results[0]).toMatchObject({
      note: "verdict fail",
      status: "fail",
    });
    expect(QaRun.runFileSummary("{")).toBeUndefined();
    expect(QaRun.runFileSummary('{"kind":"record"}')).toBeUndefined();
  });

  test("a JUnit set whose command failed without failing a test says so; a dry run runs nothing", async () => {
    const unit = plan.runs.filter((r) => r.set.name === "unit");
    const files = new FilesMock(
      new Map([["/r/out/junit/unit-app.xml", { mtime: 0, text: junit(0) }]]),
    );
    const outcome = await QaRun.execute(unit, OPTIONS, {
      clock: () => 0,
      files,
      log: () => undefined,
      process: new ProcessMock(() => 2),
    });
    expect(outcome.results[0]).toMatchObject({
      note: "the command exited with 2",
      status: "fail",
    });
    const process = new ProcessMock(() => 0);
    const lines: string[] = [];
    const dry = await QaRun.execute(
      plan.runs,
      { ...OPTIONS, dryRun: true },
      { clock: () => 0, files, log: (l) => lines.push(l), process },
    );
    expect(dry).toEqual({ exitCode: 0, results: [] });
    expect(process.commands).toEqual([]);
    expect(lines).toHaveLength(4);
  });
});

describe("ConsoleReport", () => {
  test("lists the sets with the folders they cover", () => {
    expect(ConsoleReport.list(FILE, ["app", "web"])).toEqual([
      "SET   LEVEL  RUNNER       FOLDERS",
      "unit  unit   vitest       app",
      "jvm   unit   gradle       none match svc",
      "iu    IU     cucumber-js  web",
      "gone  unit   pytest       none match py",
    ]);
  });
});
