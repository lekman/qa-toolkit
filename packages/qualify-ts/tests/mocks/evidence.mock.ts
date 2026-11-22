import type {
  RecordFile,
  RunInfo,
  StartedFile,
  TestRecord,
} from "../../src/evidence";

import { EVIDENCE_SHAPE, EvidenceFiles } from "../../src/evidence";
import { JsonText } from "../../src/values";

export const RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000";
export const OTHER_RUN = "01HQA1ZQJ0C0NF0RMANCE00001";

/** A valid run envelope. */
export const envelope = (overrides: Partial<RunInfo> = {}): RunInfo => ({
  id: RUN_ID,
  environment: "local",
  tool: {
    name: "@lekman/qualify",
    version: "0.1.0",
    language: "typescript",
    runtime: "node; vitest",
  },
  source: { commit: null, branch: "main", dirty: false },
  actor: { name: "dev", ci: null, ciRunUrl: null },
  target: {},
  policy: { productionWriteBlocked: false, overrides: [] },
  ...overrides,
});

/** A valid test record. */
export const testRecord = (
  id: string,
  overrides: Partial<TestRecord> = {},
): TestRecord => ({
  id,
  level: id.slice(0, 2) as TestRecord["level"],
  title: `${id} title`,
  given: "g",
  when: "w",
  then: "t",
  scope: id.startsWith("IU") ? "read-write" : "read",
  requirements: [],
  tags: [],
  site: `tests/${id}.test.ts:1`,
  outcome: "pass",
  startedAt: "2026-01-02T03:04:05.000Z",
  endedAt: "2026-01-02T03:04:05.010Z",
  durationMs: 10,
  checks: [],
  attachments: [],
  secretsUsed: [],
  ...overrides,
});

/** The record file name and content for a test. */
export const recordEntry = (
  test: TestRecord,
  run: RunInfo = envelope(),
): [string, string] => {
  const file: RecordFile = { schemaVersion: 1, kind: "record", run, test };
  return [
    EvidenceFiles.record(run.id, test.id, EvidenceFiles.key(test.site)),
    JsonText.document(file, EVIDENCE_SHAPE),
  ];
};

/** The marker file name and content for a test. */
export const markerEntry = (
  test: TestRecord,
  run: RunInfo = envelope(),
): [string, string] => {
  const {
    id,
    level,
    title,
    given,
    when,
    then,
    scope,
    requirements,
    tags,
    site,
    startedAt,
  } = test;
  const file: StartedFile = {
    schemaVersion: 1,
    kind: "started",
    run,
    test: {
      id,
      level,
      title,
      given,
      when,
      then,
      scope,
      requirements,
      tags,
      site,
      startedAt,
    },
  };
  return [
    EvidenceFiles.marker(run.id, test.id, EvidenceFiles.key(test.site)),
    JsonText.document(file, EVIDENCE_SHAPE),
  ];
};

/** Merge inputs from entries. */
export const inputs = (...entries: [string, string][]) =>
  entries.map(([name, text]) => ({ name, text }));
