import type {
  ExecResult,
  ITraceHost,
  PickItem,
  TraceFolder,
} from "../../src/trace";

import { Settings } from "../../src/settings";
import { WorkspaceFilesMock } from "./fixtures";

/** A workspace folder `/ws` with the default settings, or the ones given. */
export const folder = (
  raw: Readonly<Record<string, unknown>> = {},
  path = "/ws",
): TraceFolder => ({ name: "ws", path, settings: Settings.from(raw) });

/** A run file's text. */
export const runFile = (
  id: string,
  startedAt: string,
  levels: string[],
  over: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    kind: "run",
    run: {
      id,
      startedAt,
      tool: { name: "@lekman/qualify", version: "0.2.0" },
    },
    schemaVersion: 1,
    summary: { verdict: "pass" },
    tests: levels.map((level, i) => ({ id: `${level}-A-00${i}`, level })),
    ...over,
  });

/**
 * The trace command's host, in memory: files, the answers the user gives,
 * and commands that write the files they name. Records what it was asked.
 */
export class TraceHostMock implements ITraceHost {
  /** What the user answers to the "Run qualification tests" question. */
  answer = true;
  /** Commands run, with their folder. */
  readonly commands: { command: string; cwd: string }[] = [];
  /** Files copied, with the folder they were copied to. */
  readonly copied: { dir: string; files: readonly string[] }[] = [];
  /** Error messages shown. */
  readonly errors: string[] = [];
  /** Exit code of the next commands, and whether they write their output file. */
  exit: { code: null | number; output?: string; writes: boolean } = {
    code: 0,
    writes: true,
  };
  /** Files written by `runQualification`. */
  onRun: Record<string, string> = {};
  /** Paths opened. */
  readonly opened: string[] = [];
  /** The label of the entry to pick, or `undefined` to cancel. */
  pickLabel: string | undefined;
  /** The quick-pick lists shown. */
  readonly picks: { items: PickItem<unknown>[]; placeholder: string }[] = [];
  /** Quotes as on Linux. */
  readonly platform = "linux";
  /** Messages asked with an action. */
  readonly questions: string[] = [];
  /** How many times the qualification tests were run. */
  runs = 0;

  constructor(
    readonly files: Record<string, string>,
    private readonly roots: TraceFolder[] = [folder()],
  ) {}

  /** Records the question and gives the set answer. */
  async confirm(message: string, action: string): Promise<boolean> {
    this.questions.push(`${message} [${action}]`);
    return this.answer;
  }

  /** Records the copy. */
  async copy(files: readonly string[], dir: string): Promise<void> {
    this.copied.push({ dir, files });
  }

  /** Records the message. */
  error(message: string): void {
    this.errors.push(message);
  }

  /** Records the command, and writes the file its `--md` or `--out` names when set to. */
  async exec(command: string, cwd: string): Promise<ExecResult> {
    this.commands.push({ command, cwd });
    if (this.exit.writes) {
      const out = /--(?:md|out) '([^']+)'$/.exec(command)?.[1];
      if (out !== undefined) this.files[out] = "written";
    }
    return { code: this.exit.code, output: this.exit.output ?? "" };
  }

  /** Whether the file is in memory. */
  async exists(path: string): Promise<boolean> {
    return path in this.files;
  }

  /** Files in memory that match. */
  find(
    root: string,
    include: readonly string[],
    exclude: readonly string[],
  ): Promise<string[]> {
    return new WorkspaceFilesMock(this.files).find(root, include, exclude);
  }

  /** The workspace folders. */
  folders(): TraceFolder[] {
    return this.roots;
  }

  /** Records the path. */
  async open(path: string): Promise<void> {
    this.opened.push(path);
  }

  /** Records the list and picks the entry with the set label. */
  async pick<T>(
    items: readonly PickItem<T>[],
    placeholder: string,
  ): Promise<T | undefined> {
    this.picks.push({ items: [...items], placeholder });
    return items.find((i) => i.label === this.pickLabel)?.value;
  }

  /** The file's text. */
  async read(path: string): Promise<string | undefined> {
    return this.files[path];
  }

  /** Counts the run and adds the files it writes. */
  async runQualification(): Promise<void> {
    this.runs += 1;
    Object.assign(this.files, this.onRun);
  }

  /** A fixed folder. */
  async tempDir(): Promise<string> {
    return "/tmp/merge";
  }
}
