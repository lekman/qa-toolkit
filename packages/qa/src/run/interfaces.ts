/** Runs a shell command with the terminal's output. */
export interface IProcess {
  /** Runs the command and resolves with its exit code; `null` when it could not start. */
  run(
    command: string,
    options: { cwd: string; env: Readonly<Record<string, string>> },
  ): Promise<null | number>;
}

/** The files `qa` reads and writes. */
export interface IFiles {
  /** Files directly in a folder changed at or after a time, as absolute paths; none when it does not exist. */
  list(dir: string, sinceMs: number): Promise<string[]>;
  /** Creates a folder and its parents, when they do not exist. */
  mkdir(dir: string): Promise<void>;
  read(path: string): Promise<string | undefined>;
  /** Empties a folder, creating it when it does not exist. Only the CLI's own output folder. */
  reset(dir: string): Promise<void>;
  write(path: string, text: string): Promise<void>;
}

/** The ports a run uses. */
export interface RunPorts {
  /** The current time in milliseconds. */
  clock: () => number;
  files: IFiles;
  /** Writes one line to the terminal. */
  log: (line: string) => void;
  process: IProcess;
}
