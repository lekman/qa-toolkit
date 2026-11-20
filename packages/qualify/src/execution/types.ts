import type { ISecretRegistry, QualifyContext } from "../checks";
import type { DeclaredTest, Level } from "../declaration";
import type { IEvidenceWriter, RunInfo } from "../evidence";
import type { Settings } from "../settings";

/** Where sites point: paths are relative to `root`; `exclude` holds qualify's own code. */
export interface SiteContext {
  exclude: readonly string[];
  root: string;
}

/** Everything a test needs from the process that runs it. Built once per process. */
export interface ProcessContext {
  envelope: RunInfo;
  /** Absolute evidence directory. */
  evidenceDir: string;
  now(): Date;
  registry: ISecretRegistry;
  settings: Settings;
  sites: SiteContext;
  warn(message: string): void;
  writer: IEvidenceWriter;
}

/** A declaration as an adapter registers it. */
export type Registration =
  | { declared: DeclaredTest; file: string; name: string; valid: true }
  | { error: Error; name: string; valid: false };

/** A test body: the context, then the runner's own test context if it has one. */
export type TestBody<R = unknown> = (
  ctx: QualifyContext,
  runner: R,
) => Promise<void> | void;

/** What the adapter must do once the record is written. */
export type RunResult =
  | { outcome: "error" | "fail"; rethrow: unknown }
  | { outcome: "pass" }
  | { outcome: "skip"; reason: string; rethrow?: unknown };

/** A level function: `iq`, `oq`, `pq` or `iu`. */
export type LevelName = Lowercase<Level>;
