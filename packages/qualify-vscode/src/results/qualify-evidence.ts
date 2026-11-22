import type { IResultReader } from "./interfaces";
import type { Outcome, RecordedCheck, TestRecord } from "./types";

const OUTCOMES: readonly string[] = ["error", "fail", "pass", "skip"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** One test of a record file or a run file, or `undefined` when it lacks an ID or an outcome. */
const toRecord = (
  path: string,
  runId: string,
  test: unknown,
): TestRecord | undefined => {
  if (!isRecord(test)) return undefined;
  const id = text(test.id);
  const outcome = text(test.outcome);
  if (
    id === undefined ||
    outcome === undefined ||
    !OUTCOMES.includes(outcome)
  ) {
    return undefined;
  }
  const checks: RecordedCheck[] = Array.isArray(test.checks)
    ? test.checks.filter(isRecord).map((c) => ({
        actual: c.actual,
        context: text(c.context) ?? "",
        description: text(c.description) ?? "",
        expected: c.expected,
        matcher: text(c.matcher) ?? "",
        pass: c.pass === true,
        soft: c.soft === true,
        ...(text(c.site) === undefined ? {} : { site: text(c.site) }),
      }))
    : [];
  const error = isRecord(test.error)
    ? {
        message: text(test.error.message) ?? "",
        site: text(test.error.site) ?? null,
        type: text(test.error.type) ?? "Error",
      }
    : undefined;
  const site = text(test.site);
  const endedAt = text(test.endedAt);
  const skipReason = text(test.skipReason);
  return {
    checks,
    id,
    outcome: outcome as Outcome,
    path,
    runId,
    ...(typeof test.durationMs === "number"
      ? { durationMs: test.durationMs }
      : {}),
    ...(endedAt === undefined ? {} : { endedAt }),
    ...(error === undefined ? {} : { error }),
    ...(site === undefined ? {} : { site }),
    ...(skipReason === undefined ? {} : { skipReason }),
  };
};

/**
 * Reads qualify evidence (section 6 of the qualify specification): a record
 * file (`kind: "record"`) holds one test, a run file (`kind: "run"`) every
 * test of a merged run. Started markers and other JSON hold none.
 */
export class QualifyEvidence {
  /** The reader for the result-reader port. */
  static readonly READER: IResultReader = {
    accepts: (path) => path.toLowerCase().endsWith(".json"),
    format: "qualify-evidence",
    read: (path, body) => QualifyEvidence.read(path, body),
  };

  /** The tests in a file's text. */
  static read(path: string, body: string): TestRecord[] {
    let doc: unknown;
    try {
      doc = JSON.parse(body);
    } catch {
      return [];
    }
    if (!isRecord(doc) || !isRecord(doc.run)) return [];
    const runId = text(doc.run.id) ?? "";
    if (doc.kind === "record") {
      const record = toRecord(path, runId, doc.test);
      return record === undefined ? [] : [record];
    }
    if (doc.kind === "run" && Array.isArray(doc.tests)) {
      return doc.tests.flatMap((t) => {
        const record = toRecord(path, runId, t);
        return record === undefined ? [] : [record];
      });
    }
    return [];
  }
}
