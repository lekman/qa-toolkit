import type { Declaration, Level } from "../declaration";
import type { JsonValue } from "../values";

/** Outcome of one test. */
export type Outcome = "error" | "fail" | "pass" | "skip";

/** Matcher names as the JSON records them in every language. */
export type MatcherName =
  | "atLeast"
  | "atMost"
  | "contains"
  | "delegate"
  | "equals"
  | "hasLength"
  | "isFalse"
  | "isNotNull"
  | "isNull"
  | "isTrue"
  | "matches"
  | "notEquals"
  | "oneOf";

/** The implementation that wrote a file. */
export interface ToolInfo {
  language: "csharp" | "java" | "python" | "typescript";
  name: string;
  runtime: string;
  version: string;
}

/** The code under test. `null` when a value could not be read. */
export interface SourceInfo {
  branch: null | string;
  commit: null | string;
  dirty: boolean | null;
}

/** Who or what ran the tests. */
export interface ActorInfo {
  ci: null | string;
  ciRunUrl: null | string;
  name: null | string;
}

/** One test allowed to write in production for this run. */
export interface PolicyOverride {
  id: string;
  reason: string;
}

/** The write-protection policy in force for the run. */
export interface PolicyInfo {
  overrides: PolicyOverride[];
  productionWriteBlocked: boolean;
}

/** What the caller asked the runner for. */
export interface SelectionInfo {
  excludeTags: string[];
  ids: string[];
  levels: Level[];
  tags: string[];
}

/** The run envelope every marker and record carries. */
export interface RunInfo {
  actor: ActorInfo;
  environment: string;
  id: string;
  policy: PolicyInfo;
  selection?: SelectionInfo;
  source: SourceInfo;
  target: Record<string, null | string>;
  tool: ToolInfo;
}

/** The run envelope of a run file, with the run's time span. */
export interface RunFileInfo extends RunInfo {
  endedAt: string;
  mergedRuns?: string[];
  startedAt: string;
}

/** One recorded check. */
export interface CheckRecord {
  actual: JsonValue;
  at?: string;
  context: string;
  delegate?: string;
  description: string;
  expected: JsonValue;
  matcher: MatcherName;
  pass: boolean;
  seq: number;
  site: string;
  soft: boolean;
}

/** One inline attachment, already redacted. */
export interface AttachmentRecord {
  content: string;
  contentType: string;
  encoding: "base64";
  filename: string;
  sha256: string;
  sizeBytes: number;
}

/** The first failure in a test, redacted. */
export interface FailureRecord {
  message: string;
  site: null | string;
  type: string;
}

/** A finished test, as a record file and the run file hold it. */
export interface TestRecord extends Declaration {
  attachments: AttachmentRecord[];
  checks: CheckRecord[];
  durationMs: number;
  endedAt: string;
  error?: FailureRecord;
  outcome: Outcome;
  secretsUsed: string[];
  skipReason?: string;
  startedAt: string;
}

/** A started test, as the marker holds it. */
export interface StartedTest extends Declaration {
  startedAt: string;
}

/** `<runId>__<testId>__<key>.started`, written when a test starts. */
export interface StartedFile {
  kind: "started";
  run: RunInfo;
  schemaVersion: 1;
  test: StartedTest;
}

/** `<runId>__<testId>__<key>.json`, written when a test ends. */
export interface RecordFile {
  kind: "record";
  run: RunInfo;
  schemaVersion: 1;
  test: TestRecord;
}

/** Counts and verdict of a run file. */
export interface RunSummary {
  error: number;
  fail: number;
  pass: number;
  skip: number;
  total: number;
  verdict: "fail" | "incomplete" | "pass";
}

/** Level of an imported test case: a qualification level, or UT for unit tests. */
export type CaseLevel = "IQ" | "IU" | "OQ" | "PQ" | "UT";

/** The first failure or error element of an imported test case, redacted. */
export interface CaseFailure {
  /** The element's text, such as a stack trace. Absent when empty. */
  detail?: string;
  message: string;
  type: string;
}

/** One test case imported from JUnit XML, section 6.6. */
export interface TestCase {
  classname: null | string;
  durationMs: number;
  error?: CaseFailure;
  file: null | string;
  /** The first qualify test ID in the name, when there is one. */
  id?: string;
  level: CaseLevel;
  name: string;
  outcome: Outcome;
  skipReason?: string;
  /** Enclosing suite names, outermost first, joined by `" > "`. */
  suite: string;
}

/** Found, hit and percent for one coverage measure. */
export interface CoverageCounter {
  found: number;
  hit: number;
  /** `hit / found * 100` with two decimals, `null` when nothing was found. */
  percent: null | number;
}

/** Lines, functions and branches. */
export interface CoverageCounts {
  branches: CoverageCounter;
  functions: CoverageCounter;
  lines: CoverageCounter;
}

/** The coverage of one source file. */
export interface CoverageFile extends CoverageCounts {
  path: string;
}

/** Coverage imported from LCOV, with totals and one entry per file. */
export interface Coverage {
  /** Sorted by path. */
  files: CoverageFile[];
  totals: CoverageCounts;
}

/** A file `import junit` read. */
export interface ImportedFile {
  kind: "junit" | "lcov";
  path: string;
  sha256: string;
}

/** `test-evidence.json`, written by merge or by import junit. */
export interface RunFile {
  /** Test cases imported from JUnit XML. */
  cases?: TestCase[];
  coverage?: Coverage;
  /** The files import junit read. */
  imported?: ImportedFile[];
  kind: "run";
  run: RunFileInfo;
  schemaVersion: 1;
  summary: RunSummary;
  tests: TestRecord[];
}

/** Any of the three evidence files. */
export type EvidenceFile = RecordFile | RunFile | StartedFile;
