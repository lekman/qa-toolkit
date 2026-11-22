import { JunitXml } from "@lekman/test-sets";
import { basename, dirname } from "node:path";

import type { TestRecord } from "../results";
import type { RunPorts } from "./interfaces";
import type { RunGroup, RunPlanResult } from "./types";

import { QualifyEvidence, TestResults } from "../results";
import { JunitResults } from "../sets";

/** How deep under the evidence folder records are looked for. */
const DEPTH = 4;
/** Records that ended this long before the command started still count, for clock skew. */
const SKEW_MS = 2000;

/**
 * Runs a plan: each command in turn, then reads the records it left and
 * reports each test's result. A test with no record is not run, with the
 * reason.
 */
export class RunExecution {
  /** Runs every group of the plan; stops starting commands once the signal is aborted. */
  static async execute(
    plan: RunPlanResult,
    runId: string,
    ports: RunPorts,
    signal: AbortSignal,
  ): Promise<void> {
    for (const { reason, test } of plan.refused)
      ports.reporter.errored(test, reason);
    for (const group of plan.groups) {
      if (signal.aborted) {
        for (const test of group.tests) {
          ports.reporter.result(test, {
            messages: [],
            outcome: "not-run",
            output: [`${test.declaration.id}: not run. The run was cancelled.`],
          });
        }
        continue;
      }
      await RunExecution.group(group, runId, ports, signal);
    }
  }

  /** The records under a folder that changed at or after a time. */
  static async records(
    dir: string,
    sinceMs: number,
    ports: Pick<RunPorts, "files" | "readers">,
  ): Promise<TestRecord[]> {
    const readers = ports.readers ?? [QualifyEvidence.READER];
    const files = await ports.files.list(dir, DEPTH, sinceMs);
    const records: TestRecord[] = [];
    for (const file of files.sort()) {
      const reader = readers.find((r) => r.accepts(file));
      if (reader === undefined) continue;
      const text = await ports.files.read(file);
      if (text !== undefined) records.push(...reader.read(file, text));
    }
    return records;
  }

  private static async group(
    group: RunGroup,
    runId: string,
    ports: RunPorts,
    signal: AbortSignal,
  ): Promise<void> {
    for (const test of group.tests) ports.reporter.started(test);
    if (group.format === "junit-xml" && !group.results.includes("*")) {
      // Some runners, such as bun test, do not create the report's folder.
      await ports.files.mkdir(dirname(group.results));
    }
    ports.reporter.output(`$ ${group.command}\n  in ${group.cwd}\n`);
    const started = ports.clock() - SKEW_MS;
    let exit: null | number;
    try {
      exit = await ports.process.run(group.command, {
        cwd: group.cwd,
        env: group.env,
        onOutput: (text) => ports.reporter.output(text),
        signal,
      });
    } catch (error) {
      exit = -1;
      ports.reporter.output(`The command did not start: ${String(error)}\n`);
    }
    const records =
      group.format === "junit-xml"
        ? await RunExecution.junit(group, runId, started, ports)
        : await RunExecution.records(group.evidenceDir, started, ports);
    const how = exit === null ? "was stopped" : `exited with code ${exit}`;
    const reason =
      group.format === "junit-xml"
        ? `The command ${how} and its JUnit XML at ${group.results} has no case for this test.`
        : `The command ${how} and wrote no evidence record for this test under ${group.evidenceDir}.`;
    const window = { runId, since: new Date(started).toISOString() };
    for (const test of group.tests) {
      ports.reporter.result(
        test,
        TestResults.forTest(test.declaration.id, records, window, reason),
      );
    }
  }

  /** The records of a group's ordinary tests, from the JUnit XML its command wrote. */
  private static async junit(
    group: RunGroup,
    runId: string,
    sinceMs: number,
    ports: RunPorts,
  ): Promise<TestRecord[]> {
    const pattern = basename(group.results);
    const glob = new RegExp(
      `^${pattern
        .split("*")
        .map((p) => p.replace(/[.+?^$(){}|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
    );
    const files = group.results.includes("*")
      ? (await ports.files.list(dirname(group.results), 0, sinceMs)).filter(
          (f) => glob.test(basename(f)),
        )
      : [group.results];
    const endedAt = new Date(ports.clock()).toISOString();
    const records: TestRecord[] = [];
    for (const file of files) {
      const text = await ports.files.read(file);
      if (text === undefined) continue;
      records.push(
        ...JunitResults.records(
          JunitXml.cases(text),
          group.tests,
          runId,
          file,
          endedAt,
        ),
      );
    }
    return records;
  }
}
