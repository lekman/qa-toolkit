import type { Level } from "../declaration";
import type { ActorInfo, SourceInfo } from "../evidence";

/** Values registered for redaction. Shared by every test in a process. */
export interface ISecretRegistry {
  /** Register a value. Returns `false` when it is refused as too short. */
  add(value: string): boolean;
  /** Every registered value. */
  values(): readonly string[];
}

/** What a test context needs from the process that runs it. */
export interface ContextSettings {
  /** Attachment size limit in bytes. */
  attachmentLimit: number;
  environment: string;
  id: string;
  level: Level;
  /** The current time. */
  now(): Date;
  /** Read a secret by name, or `undefined` when it is not set. */
  readSecret(name: string): string | undefined;
  registry: ISecretRegistry;
  /** The run's source, actor and target, for `ctx.runContext`. */
  runContext(): {
    actor: ActorInfo;
    source: SourceInfo;
    target: Record<string, null | string>;
  };
  /** The `path:line` of the test code calling into qualify right now. */
  site(): string;
  /** Report a problem that does not fail the test. */
  warn(message: string): void;
}
