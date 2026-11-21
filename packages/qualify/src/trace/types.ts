import type { Level, Risk } from "../declaration";
import type { RunFile } from "../evidence";

/** Where a requirement link came from. */
export type LinkSource = "code" | "map" | "protocol";

/** One test the protocol requires. */
export interface ProtocolEntry {
  id: string;
  level: Level;
  requirements: string[];
  risk?: Risk;
  title: string;
}

/** A file given to `trace`, with the digest of its bytes. */
export interface TraceSource<T> {
  content: T;
  path: string;
  sha256: string;
}

/** Everything `trace` reads. */
export interface TraceRequest {
  evidence: readonly TraceSource<RunFile>[];
  failOnSkip: boolean;
  map?: TraceSource<Map<string, string[]>>;
  protocol?: TraceSource<ProtocolEntry[]>;
}

/** One row of the matrix. */
export interface TraceRow {
  controls: null | string;
  environment: null | string;
  level: Level;
  outcome: "error" | "fail" | "not-run" | "pass" | "skip";
  requirement: null | string;
  risk: null | Risk;
  run: null | string;
  sources: LinkSource[];
  testId: string;
  title: string;
}

/** `trace.json`, defined by `spec/qualify/trace.schema.json`. */
export interface TraceFile {
  inputs: {
    path: string;
    role: "evidence" | "map" | "protocol";
    sha256: string;
  }[];
  kind: "trace";
  notRun: string[];
  requirementsWithoutPass: string[];
  rows: TraceRow[];
  runs: {
    commit: null | string;
    environment: string;
    id: string;
    verdict: "fail" | "incomplete" | "pass";
  }[];
  schemaVersion: 1;
  summary: {
    error: number;
    fail: number;
    notRun: number;
    pass: number;
    requirements: number;
    requirementsWithoutPass: number;
    skip: number;
    tests: number;
    verdict: "fail" | "incomplete" | "pass";
  };
}

/** The matrix and the exit code it implies. */
export interface TraceResult {
  exitCode: 0 | 1 | 3;
  trace: TraceFile;
}
