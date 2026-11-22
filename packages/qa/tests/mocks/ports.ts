import type { IFiles, IProcess } from "../../src/run";

/** Files held in memory, each with a change time. */
export class FilesMock implements IFiles {
  /** The folders reset so far. */
  readonly resets: string[] = [];

  constructor(
    readonly files: Map<string, { mtime: number; text: string }> = new Map(),
  ) {}

  /** Files directly in the folder changed at or after the time. */
  async list(dir: string, sinceMs: number): Promise<string[]> {
    return [...this.files.entries()]
      .filter(
        ([p, f]) =>
          p.slice(0, p.lastIndexOf("/")) === dir && f.mtime >= sinceMs,
      )
      .map(([p]) => p);
  }

  /** Records nothing: folders are implicit in memory. */
  async mkdir(): Promise<void> {}

  /** A file's text. */
  async read(path: string): Promise<string | undefined> {
    return this.files.get(path)?.text;
  }

  /** Records the reset. */
  async reset(dir: string): Promise<void> {
    this.resets.push(dir);
  }

  /** Stores the file. */
  async write(path: string, text: string): Promise<void> {
    this.files.set(path, { mtime: 0, text });
  }
}

/** A process that answers each command with a script of its own. */
export class ProcessMock implements IProcess {
  /** The commands run so far. */
  readonly commands: {
    command: string;
    cwd: string;
    env: Readonly<Record<string, string>>;
  }[] = [];

  constructor(private readonly answer: (command: string) => null | number) {}

  /** Records the command and returns its scripted exit code. */
  async run(
    command: string,
    options: { cwd: string; env: Readonly<Record<string, string>> },
  ): Promise<null | number> {
    this.commands.push({ command, ...options });
    return this.answer(command);
  }
}
