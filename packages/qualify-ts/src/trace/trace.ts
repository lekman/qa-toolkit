import type { Level } from "../declaration";
import type { Outcome, TestCase, TestRecord } from "../evidence";
import type {
  LinkSource,
  ProtocolEntry,
  TraceFile,
  TraceRequest,
  TraceResult,
  TraceRow,
} from "./types";

import { Values } from "../values";

const SOURCE_ORDER: readonly LinkSource[] = ["code", "protocol", "map"];

/** What a row of the matrix reads from a test record or an imported case. */
type Traced = Pick<TestRecord, "controls" | "id" | "risk" | "title"> & {
  level: Level;
  outcome: Outcome;
  requirements: readonly string[];
};

/**
 * An imported case with an ID, as the matrix sees it: the ID's prefix as its
 * level, its name as its title, and no links of its own (section 8).
 */
const fromCase = (c: TestCase & { id: string }): Traced => ({
  id: c.id,
  level: c.id.slice(0, 2) as Level,
  title: c.name,
  outcome: c.outcome,
  requirements: [],
});

const compareNullable = (a: null | string, b: null | string): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return Values.compare(a, b);
};

/** `qualify trace`: the matrix from requirements to results, section 8. */
export class Trace {
  /** Build the matrix and decide the exit code. */
  static build(request: TraceRequest): TraceResult {
    const protocol = new Map<string, ProtocolEntry>(
      (request.protocol?.content ?? []).map((entry) => [entry.id, entry]),
    );
    const map = request.map?.content ?? new Map<string, string[]>();
    const records: { environment: string; run: string; test: Traced }[] =
      request.evidence.flatMap((source) =>
        [
          ...source.content.tests,
          ...(source.content.cases ?? [])
            .filter((c): c is TestCase & { id: string } => c.id !== undefined)
            .map(fromCase),
        ].map((test) => ({
          run: source.content.run.id,
          environment: source.content.run.environment,
          test,
        })),
      );
    const seen = new Set(records.map((r) => r.test.id));

    const rows: TraceRow[] = [];
    for (const { run, environment, test } of records) {
      for (const [requirement, sources] of Trace.links(
        test.requirements,
        protocol.get(test.id)?.requirements ?? [],
        map.get(test.id) ?? [],
      )) {
        rows.push({
          requirement,
          sources,
          testId: test.id,
          level: test.level,
          title: test.title,
          risk: test.risk ?? protocol.get(test.id)?.risk ?? null,
          controls: test.controls ?? null,
          outcome: test.outcome,
          run,
          environment,
        });
      }
    }
    const notRun = [...protocol.keys()]
      .filter((id) => !seen.has(id))
      .sort(Values.compare);
    for (const id of notRun) {
      const entry = protocol.get(id) as ProtocolEntry;
      for (const [requirement, sources] of Trace.links(
        [],
        entry.requirements,
        map.get(id) ?? [],
      )) {
        rows.push({
          requirement,
          sources,
          testId: id,
          level: entry.level,
          title: entry.title,
          risk: entry.risk ?? null,
          controls: null,
          outcome: "not-run",
          run: null,
          environment: null,
        });
      }
    }

    const sorted = Trace.sort(rows);
    const requirements = [
      ...new Set(
        sorted.flatMap((r) => (r.requirement === null ? [] : [r.requirement])),
      ),
    ].sort(Values.compare);
    const withoutPass = requirements.filter(
      (req) =>
        !sorted.some((r) => r.requirement === req && r.outcome === "pass"),
    );

    const count = (outcome: Outcome): number =>
      records.filter((r) => r.test.outcome === outcome).length;
    const failed = count("fail") + count("error") > 0;
    const required = (id: string): boolean =>
      protocol.size === 0 || protocol.has(id);
    const skippedRequired =
      request.failOnSkip &&
      records.some((r) => r.test.outcome === "skip" && required(r.test.id));
    const exitCode: 0 | 1 | 3 = failed
      ? 1
      : records.length === 0 || notRun.length > 0 || skippedRequired
        ? 3
        : 0;

    const trace: TraceFile = {
      schemaVersion: 1,
      kind: "trace",
      inputs: [
        ...request.evidence.map((s) => ({
          path: s.path,
          role: "evidence" as const,
          sha256: s.sha256,
        })),
        ...(request.protocol
          ? [
              {
                path: request.protocol.path,
                role: "protocol" as const,
                sha256: request.protocol.sha256,
              },
            ]
          : []),
        ...(request.map
          ? [
              {
                path: request.map.path,
                role: "map" as const,
                sha256: request.map.sha256,
              },
            ]
          : []),
      ],
      runs: request.evidence.map((s) => ({
        id: s.content.run.id,
        environment: s.content.run.environment,
        commit: s.content.run.source.commit,
        verdict: s.content.summary.verdict,
      })),
      summary: {
        tests: records.length,
        pass: count("pass"),
        fail: count("fail"),
        error: count("error"),
        skip: count("skip"),
        notRun: notRun.length,
        requirements: requirements.length,
        requirementsWithoutPass: withoutPass.length,
        verdict:
          exitCode === 1 ? "fail" : exitCode === 3 ? "incomplete" : "pass",
      },
      rows: sorted,
      notRun,
      requirementsWithoutPass: withoutPass,
    };
    return { exitCode, trace };
  }

  /**
   * The union of a test's requirement links with their sources. A test with
   * no link gets one entry with requirement `null`, so it still has a row.
   */
  private static links(
    code: readonly string[],
    protocol: readonly string[],
    map: readonly string[],
  ): [null | string, LinkSource[]][] {
    const links = new Map<string, Set<LinkSource>>();
    const add = (requirements: readonly string[], source: LinkSource): void => {
      for (const r of requirements)
        links.set(r, (links.get(r) ?? new Set()).add(source));
    };
    add(code, "code");
    add(protocol, "protocol");
    add(map, "map");
    if (links.size === 0) return [[null, []]];
    return [...links].map(([requirement, sources]) => [
      requirement,
      SOURCE_ORDER.filter((s) => sources.has(s)),
    ]);
  }

  /**
   * Rows by requirement (none last), then test ID, then run. A control test
   * sorts directly after the test it controls when both have rows under the
   * same requirement, so the pair sits on adjacent rows.
   */
  private static sort(rows: TraceRow[]): TraceRow[] {
    const present = new Set(
      rows.map((r) => `${r.requirement ?? ""}\u0000${r.testId}`),
    );
    const anchor = (row: TraceRow): string =>
      row.controls !== null &&
      present.has(`${row.requirement ?? ""}\u0000${row.controls}`)
        ? row.controls
        : row.testId;
    return [...rows].sort(
      (a, b) =>
        compareNullable(a.requirement, b.requirement) ||
        Values.compare(anchor(a), anchor(b)) ||
        Number(anchor(a) !== a.testId) - Number(anchor(b) !== b.testId) ||
        Values.compare(a.testId, b.testId) ||
        compareNullable(a.run, b.run),
    );
  }
}
