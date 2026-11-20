import type { IRuntimeDependencies } from "../execution";

/** What the CLI reads and writes. Implemented by the system layer. */
export interface ICliIO extends IRuntimeDependencies {
  /** File names in a directory, or `undefined` when it does not exist. */
  list(dir: string): Promise<string[] | undefined>;
  /** A file's bytes. Throws when it cannot be read. */
  readBytes(path: string): Promise<Uint8Array>;
  /** Write to standard error. */
  stderr(text: string): void;
  /** Write to standard output. */
  stdout(text: string): void;
}
