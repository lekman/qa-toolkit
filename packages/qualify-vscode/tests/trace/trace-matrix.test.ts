import { describe, expect, test } from "bun:test";

import { QualifyCli, TraceMatrix } from "../../src/trace";
import { folder, runFile, TraceHostMock } from "../mocks/trace-host.mock";

const A = "01M828ZGK00000000000000000"; // 2026-11-22 18:41 UTC
const B = "01M82A29W00000000000000000"; // 2026-11-22 19:00 UTC
const EVIDENCE = "/ws/app/qualification/evidence";
const RUN = `${EVIDENCE}/test-evidence.json`;
const BIN = "/ws/node_modules/.bin/qualify";

describe("TraceMatrix", () => {
  test("opens the only trace matrix there is", async () => {
    const host = new TraceHostMock({ "/ws/out/trace.md": "#" });
    await TraceMatrix.open(host);
    expect(host.opened).toEqual(["/ws/out/trace.md"]);
    expect(host.commands).toEqual([]);
  });

  test("asks which trace matrix when there are several, and does nothing on cancel", async () => {
    const files = { "/a/trace.json": "{}", "/ws/out/trace.md": "#" };
    const roots = [folder(), { ...folder({}, "/a"), name: "a" }];
    const host = new TraceHostMock(files, roots);
    host.pickLabel = "a/trace.json";
    await TraceMatrix.open(host);
    expect(host.picks[0]?.items.map((i) => i.label)).toEqual([
      "a/trace.json",
      "ws/out/trace.md",
    ]);
    expect(host.opened).toEqual(["/a/trace.json"]);

    const cancel = new TraceHostMock(files, roots);
    await TraceMatrix.open(cancel);
    expect(cancel.opened).toEqual([]);
  });

  test("with no folder open, says so", async () => {
    const host = new TraceHostMock({}, []);
    await TraceMatrix.open(host);
    expect(host.errors[0]).toContain("no folder is open");
  });

  test("builds the trace matrix next to the only run file with the installed CLI, then opens it", async () => {
    const host = new TraceHostMock({
      [BIN]: "",
      [RUN]: runFile(A, "2026-11-22T18:41:22Z", ["OQ"]),
    });
    await TraceMatrix.open(host);
    expect(host.commands).toEqual([
      {
        command: `'${BIN}' trace '${RUN}' --md '${EVIDENCE}/trace.md'`,
        cwd: "/ws",
      },
    ]);
    expect(host.opened).toEqual([`${EVIDENCE}/trace.md`]);
    expect(host.picks).toEqual([]);
  });

  test("with several runs, builds the one the user picks; nothing on cancel", async () => {
    const files = {
      [RUN]: runFile(A, "2026-11-22T18:41:00Z", ["OQ"]),
      "/ws/web/qualification/evidence/test-evidence.json": runFile(
        B,
        "2026-11-22T19:00:00Z",
        ["IU"],
      ),
    };
    const host = new TraceHostMock({ ...files });
    host.pickLabel = "OQ · app · 2026-11-22 18:41 UTC";
    await TraceMatrix.open(host);
    expect(host.picks[0]?.items.map((i) => i.label)).toEqual([
      "IU · web · 2026-11-22 19:00 UTC",
      "OQ · app · 2026-11-22 18:41 UTC",
    ]);
    expect(host.opened).toEqual([`${EVIDENCE}/trace.md`]);

    const cancel = new TraceHostMock({ ...files });
    await TraceMatrix.open(cancel);
    expect(cancel.commands).toEqual([]);
    expect(cancel.opened).toEqual([]);
  });

  test("merges the records of a run that has no run file, then builds its trace", async () => {
    const host = new TraceHostMock({
      [`${EVIDENCE}/records/${A}__OQ-A-001__0123abcd.json`]: "{}",
      "/ws/bun.lock": "",
    });
    await TraceMatrix.open(host);
    expect(host.commands.map((c) => c.command)).toEqual([
      `bunx @lekman/qualify merge --evidence-dir '${EVIDENCE}' --out '${RUN}'`,
      `bunx @lekman/qualify trace '${RUN}' --md '${EVIDENCE}/trace.md'`,
    ]);
    expect(host.copied).toEqual([]);
    expect(host.opened).toEqual([`${EVIDENCE}/trace.md`]);
  });

  test("merges only the picked run's records when the folder holds several runs", async () => {
    const picked = `${EVIDENCE}/records/${B}__OQ-A-001__0123abcd.json`;
    const host = new TraceHostMock({
      [`${EVIDENCE}/records/${A}__OQ-A-001__0123abcd.json`]: "{}",
      [picked]: "{}",
    });
    host.pickLabel = "OQ · app · 2026-11-22 19:00 UTC";
    await TraceMatrix.open(host);
    expect(host.copied).toEqual([
      { dir: "/tmp/merge/records", files: [picked] },
    ]);
    expect(host.commands[0]?.command).toBe(
      `npx --yes @lekman/qualify merge --evidence-dir '/tmp/merge' --out '${RUN}'`,
    );
    expect(host.opened).toEqual([`${EVIDENCE}/trace.md`]);
  });

  test("with no run at all, runs the qualification tests when asked, then builds the trace", async () => {
    const host = new TraceHostMock({});
    host.onRun = { [RUN]: runFile(A, "2026-11-22T18:41:00Z", ["OQ"]) };
    await TraceMatrix.open(host);
    expect(host.questions).toEqual([
      "There is no trace matrix yet, and no qualification run to build one from. [Run qualification tests]",
    ]);
    expect(host.runs).toBe(1);
    expect(host.commands[0]?.command).toBe(
      `npx --yes @lekman/qualify@0.2.0 trace '${RUN}' --md '${EVIDENCE}/trace.md'`,
    );
    expect(host.opened).toEqual([`${EVIDENCE}/trace.md`]);
  });

  test("with no run at all, does nothing when the user declines", async () => {
    const host = new TraceHostMock({});
    host.answer = false;
    await TraceMatrix.open(host);
    expect(host.runs).toBe(0);
    expect(host.errors).toEqual([]);
  });

  test("says why when the tests ran but left no evidence", async () => {
    const host = new TraceHostMock({});
    await TraceMatrix.open(host);
    expect(host.runs).toBe(1);
    expect(host.errors[0]).toContain("left no evidence");
  });

  test("says why when qualify trace writes nothing", async () => {
    const host = new TraceHostMock({ [RUN]: runFile(A, "x", ["OQ"]) });
    host.exit = {
      code: 2,
      output: "line 1\nqualify trace: bad input\n",
      writes: false,
    };
    await TraceMatrix.open(host);
    expect(host.opened).toEqual([]);
    expect(host.errors).toEqual([
      "The trace matrix cannot be built: qualify trace could not read app/qualification/evidence/test-evidence.json, and it exited with code 2: line 1 qualify trace: bad input",
    ]);
  });

  test("says why when qualify merge writes nothing", async () => {
    const host = new TraceHostMock({
      [`${EVIDENCE}/records/${A}__OQ-A-001__0123abcd.json`]: "{}",
    });
    host.exit = { code: null, writes: false };
    await TraceMatrix.open(host);
    expect(host.commands).toHaveLength(1);
    expect(host.errors[0]).toBe(
      "The trace matrix cannot be built: qualify merge could not build a run file from the records in app/qualification/evidence, and it did not finish",
    );
  });
});

describe("QualifyCli", () => {
  test("the version a package.json pins", () => {
    const pkg = (deps: Record<string, unknown>) =>
      JSON.stringify({ devDependencies: deps });
    expect(QualifyCli.pinned(pkg({ "@lekman/qualify": "0.2.0" }))).toBe(
      "0.2.0",
    );
    expect(QualifyCli.pinned(pkg({ "@lekman/qualify": "^0.3.1" }))).toBe(
      "0.3.1",
    );
    expect(
      QualifyCli.pinned(pkg({ "@lekman/qualify": "workspace:*" })),
    ).toBeUndefined();
    expect(QualifyCli.pinned(pkg({ other: "1.0.0" }))).toBeUndefined();
    expect(QualifyCli.pinned("not json")).toBeUndefined();
  });

  test("the command: the install, else bunx or npx at the pinned version", () => {
    expect(QualifyCli.command({ bin: "C:\\q.cmd", bun: true }, "win32")).toBe(
      '"C:\\q.cmd"',
    );
    expect(QualifyCli.command({ bun: true, version: "0.2.0" }, "linux")).toBe(
      "bunx @lekman/qualify@0.2.0",
    );
    expect(QualifyCli.command({ bun: false }, "linux")).toBe(
      "npx --yes @lekman/qualify",
    );
  });

  test("looks up from the run's folder to the workspace folder", async () => {
    const host = new TraceHostMock({
      "/ws/app/bun.lockb": "",
      "/ws/app/package.json": JSON.stringify({
        dependencies: { "@lekman/qualify": "0.1.9" },
      }),
      "/ws/package.json": JSON.stringify({
        dependencies: { "@lekman/qualify": "0.2.0" },
      }),
    });
    const facts = await QualifyCli.facts(host, {
      dir: EVIDENCE,
      folder: folder(),
      levels: [],
      package: "app",
      runId: A,
      startedMs: 0,
      tests: 0,
      toolVersion: "0.3.0",
    });
    expect(facts).toEqual({ bun: true, version: "0.1.9" });
  });
});
