import type { ISecretRegistry, QualifyContext, TestContext } from "../checks";
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

/**
 * Sites a runner knows better than a stack trace, for example the feature
 * file line of the step that is running.
 */
export interface SiteOverrides {
  /** The site of each check, in place of the caller's frame. */
  check?: () => string;
  /** The site of a failure other than a failed check, in place of the innermost frame in the test file. */
  failure?: () => null | string;
}

/** A test whose started marker is written and whose body has not ended. */
export interface StartedTest {
  /** The context the body records its checks on. */
  ctx: TestContext;
  /** The evidence file key, from the declaration's site. */
  key: string;
  overrides: SiteOverrides;
  /** Why the policy skips the test; the body must not run when set. */
  policySkip?: string;
  process: ProcessContext;
  registration: Extract<Registration, { valid: true }>;
  /** The envelope as the files carry it. */
  run: RunInfo;
  startedAt: Date;
}
