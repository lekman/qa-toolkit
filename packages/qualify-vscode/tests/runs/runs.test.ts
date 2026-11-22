import { describe, expect, test } from "bun:test";

import type { PlanContext } from "../../src/runs";

import { PackageRoots } from "../../src/packages";
import { RunExecution, RunPlan } from "../../src/runs";
import { Settings } from "../../src/settings";
import {
  ProcessMock,
  ReporterMock,
  resolved,
  ResultFilesMock,
} from "../mocks/fixtures";

const RUN = "01JZ0000000000000000000000";

const context = (raw: Record<string, unknown> = {}): PlanContext => ({
  index: () => PackageRoots.index(["/ws/app/package.json", "/ws/bun.lock"]),
  platform: "linux",
  runId: RUN,
  settings: () => Settings.from(raw),
});

describe("RunPlan", () => {
  test("one command per package and runner, with the runner's filter, the evidence folder and the run ID", () => {
    const plan = RunPlan.build(
      [
        resolved({ id: "OQ-EXPORT-001" }),
        resolved({ id: "OQ-EXPORT-002" }),
        resolved({ id: "IU-WEB-001", level: "IU" }, "cucumber-js"),
      ],
      context(),
    );
    expect(plan.refused).toEqual([]);
    expect(plan.groups.map((g) => g.command)).toEqual([
      `bunx vitest run -t '\\[OQ-EXPORT-001\\]|\\[OQ-EXPORT-002\\]'`,
      `bunx cucumber-js --name '^IU-WEB-001\\b'`,
    ]);
    expect(plan.groups[0]?.cwd).toBe("/ws/app");
    expect(plan.groups[0]?.env).toEqual({
      QUALIFY_EVIDENCE_DIR: "/ws/app/qualification/evidence",
      QUALIFY_RUN_ID: RUN,
    });
  });

  test("a package command with ${ids}, and one command per test with ${id}", () => {
    const tests = [
      resolved({ id: "IU-WEB-001", level: "IU" }, "cucumber-js"),
      resolved({ id: "IU-WEB-002", level: "IU" }, "cucumber-js"),
    ];
    const ids = RunPlan.build(
      tests,
      context({
        packages: {
          app: {
            command: "task test:intended-use -- ${ids}",
            evidenceDir: "/abs/evidence",
          },
        },
      }),
    );
    expect(ids.groups.map((g) => g.command)).toEqual([
      "task test:intended-use -- IU-WEB-001 IU-WEB-002",
    ]);
    expect(ids.groups[0]?.evidenceDir).toBe("/abs/evidence");
    const each = RunPlan.build(
      tests,
      context({ runners: { "cucumber-js": "run ${id} in ${package}" } }),
    );
    expect(each.groups.map((g) => g.command)).toEqual([
      "run IU-WEB-001 in /ws/app",
      "run IU-WEB-002 in /ws/app",
    ]);
  });

  test("a test with a declaration problem is refused", () => {
    const plan = RunPlan.build([resolved({ problems: ["bad ID"] })], context());
    expect(plan.groups).toEqual([]);
    expect(plan.refused.map((r) => r.reason)).toEqual(["not run: bad ID"]);
  });

  test("a JUnit test whose method could not be read is refused", () => {
    const plan = RunPlan.build(
      [resolved({ framework: "junit" }, "gradle")],
      context(),
    );
    expect(plan.refused[0]?.reason).toContain(
      "selects a test by class and method",
    );
    const ok = RunPlan.build(
      [resolved({ className: "A", framework: "junit", method: "b" }, "gradle")],
      context(),
    );
    expect(ok.groups.map((g) => g.command)).toEqual([
      "gradle test --tests '*A.b'",
    ]);
  });
});

describe("RunExecution", () => {
  const record = (id: string, outcome: string) =>
    JSON.stringify({
      kind: "record",
      run: { id: RUN },
      test: { checks: [], endedAt: "2026-11-22T10:00:01.000Z", id, outcome },
    });

  test("runs each command, reads the records it wrote and reports each test", async () => {
    const tests = [
      resolved({ id: "OQ-EXPORT-001" }),
      resolved({ id: "OQ-EXPORT-002" }),
      resolved({ id: "OQ-EXPORT-003", problems: ["bad"] }),
    ];
    const plan = RunPlan.build(tests, context());
    const files = new ResultFilesMock({
      "/ws/app/qualification/evidence/records/a.json": {
        mtime: 5000,
        text: record("OQ-EXPORT-001", "pass"),
      },
      "/ws/app/qualification/evidence/records/a.started": {
        mtime: 5000,
        text: "{}",
      },
      "/ws/app/qualification/evidence/records/old.json": {
        mtime: 1,
        text: record("OQ-EXPORT-002", "pass"),
      },
    });
    const process = new ProcessMock(1);
    const reporter = new ReporterMock();
    await RunExecution.execute(
      plan,
      RUN,
      { clock: () => 4000, files, process, reporter },
      new AbortController().signal,
    );
    expect(process.commands).toHaveLength(1);
    expect(reporter.events).toEqual([
      "errored OQ-EXPORT-003: not run: bad",
      "started OQ-EXPORT-001",
      "started OQ-EXPORT-002",
      `output $ ${plan.groups[0]?.command}\n  in /ws/app`,
      "output runner output",
      "result OQ-EXPORT-001: pass",
      "result OQ-EXPORT-002: not-run",
    ]);
    expect(reporter.results.get("OQ-EXPORT-002")).toMatchObject({
      output: [
        "OQ-EXPORT-002: not run. The command exited with code 1 and wrote no evidence record for this test under /ws/app/qualification/evidence.",
      ],
    });
  });

  test("a command that does not start, and a cancelled run", async () => {
    const plan = RunPlan.build([resolved()], context());
    const reporter = new ReporterMock();
    const ports = {
      clock: () => 0,
      files: new ResultFilesMock({}),
      process: new ProcessMock(0, true),
      reporter,
    };
    await RunExecution.execute(plan, RUN, ports, new AbortController().signal);
    expect(reporter.events).toContain(
      "output The command did not start: Error: spawn failed",
    );
    expect(reporter.events).toContain("result OQ-EXPORT-001: not-run");
    const cancelled = new ReporterMock();
    const abort = new AbortController();
    abort.abort();
    await RunExecution.execute(
      plan,
      RUN,
      { ...ports, reporter: cancelled },
      abort.signal,
    );
    expect(cancelled.events).toEqual(["result OQ-EXPORT-001: not-run"]);
  });

  test("a stopped command says so", async () => {
    const plan = RunPlan.build([resolved()], context());
    const reporter = new ReporterMock();
    await RunExecution.execute(
      plan,
      RUN,
      {
        clock: () => 0,
        files: new ResultFilesMock({}),
        process: new ProcessMock(null),
        reporter,
      },
      new AbortController().signal,
    );
    expect(JSON.stringify(reporter.results.get("OQ-EXPORT-001"))).toContain(
      "The command was stopped",
    );
  });
});
