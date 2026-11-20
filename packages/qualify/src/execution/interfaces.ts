import type { IGitProbe } from "../envelope";
import type { IEvidenceWriter } from "../evidence";
import type { EnvironmentVariables } from "../settings";

/** What the runtime reads from and writes to the process. */
export interface IRuntimeDependencies {
  /** The working directory. */
  cwd(): string;
  env: EnvironmentVariables;
  git: IGitProbe;
  now(): Date;
  /** Cryptographically random bytes. */
  random(size: number): Uint8Array;
  /** The runtime and its version, for example `node 22.11.0`. */
  runtime(): string;
  warn(message: string): void;
  writer: IEvidenceWriter;
}

/** What an adapter tells the runtime about its runner. */
export interface AdapterInfo {
  /** The folder holding qualify's own code, never a test's site. */
  ownRoot: string;
  /** The runner and its version, for example `vitest 3.2.4`. */
  runner: string;
  /**
   * The run ID for this process. `create` makes a new ULID; an adapter calls
   * it only where its process controls the run.
   */
  runId(env: EnvironmentVariables, create: () => string): string;
}
