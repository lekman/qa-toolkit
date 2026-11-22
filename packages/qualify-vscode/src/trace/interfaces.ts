import type { ExecResult, PickItem, TraceFolder } from "./types";

/** What the trace command needs from the editor, the file system and the shell. */
export interface ITraceHost {
  /** Asks a question with one action button; `true` when the user chose it. */
  confirm(message: string, action: string): Promise<boolean>;
  /** Copies files into a folder, creating it. */
  copy(files: readonly string[], dir: string): Promise<void>;
  /** Shows an error message. */
  error(message: string): void;
  /** Runs a command in a folder, with progress shown, and returns its exit code and output. */
  exec(command: string, cwd: string): Promise<ExecResult>;
  /** Whether a file exists. */
  exists(path: string): Promise<boolean>;
  /** Files under a folder that match a glob in `include` and none in `exclude`. */
  find(
    folder: string,
    include: readonly string[],
    exclude: readonly string[],
  ): Promise<string[]>;
  /** The open workspace folders. */
  folders(): TraceFolder[];
  /** Opens a trace matrix: Markdown in the preview, JSON as text. */
  open(path: string): Promise<void>;
  /** Asks the user to pick one; `undefined` when they cancel. */
  pick<T>(
    items: readonly PickItem<T>[],
    placeholder: string,
  ): Promise<T | undefined>;
  /** `process.platform`, for quoting. */
  readonly platform: string;
  /** Reads a file; `undefined` when it cannot be read. */
  read(path: string): Promise<string | undefined>;
  /** Runs every qualification test of the workspace and resolves when the run ends. */
  runQualification(): Promise<void>;
  /** A new empty folder for temporary files. */
  tempDir(): Promise<string>;
}
