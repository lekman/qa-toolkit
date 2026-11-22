import type { Declaration } from "../../src/discovery";
import type { IResultFiles } from "../../src/results";
import type { IProcessRunner, IRunReporter } from "../../src/runs";
import type { IWorkspaceFiles, ResolvedTest } from "../../src/workspace";

import { RunnerDefinitions } from "../../src/runners";

/** A declaration with defaults for every field a test does not care about. */
export const declaration = (over: Partial<Declaration> = {}): Declaration => ({
  file: "/ws/app/a.test.ts",
  framework: "vitest",
  id: "OQ-EXPORT-001",
  language: "typescript",
  level: "OQ",
  line: 3,
  problems: [],
  requirements: [],
  tags: [],
  title: "A title",
  ...over,
});

/** A resolved test in package `app` of workspace folder `/ws`. */
export const resolved = (
  over: Partial<Declaration> = {},
  runner = "vitest",
): ResolvedTest => ({
  declaration: declaration(over),
  folder: { name: "ws", path: "/ws" },
  package: { markers: ["package.json"], path: "app", root: "/ws/app" },
  runner: RunnerDefinitions.byId(runner) as NonNullable<
    ReturnType<typeof RunnerDefinitions.byId>
  >,
});

/** A glob as a regular expression, for double star, star, question mark and braces. */
const globRegex = (glob: string): RegExp => {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (glob.startsWith("**/", i)) {
      out += "(?:.*/)?";
      i += 2;
    } else if (glob.startsWith("**", i)) {
      out += ".*";
      i += 1;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else if (c === "{") out += "(?:";
    else if (c === "}") out += ")";
    else if (c === ",") out += "|";
    else out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};

/** Workspace files held in memory. */
export class WorkspaceFilesMock implements IWorkspaceFiles {
  constructor(private readonly files: Record<string, string>) {}

  /** Files under the folder whose relative path matches a glob. */
  async find(
    folder: string,
    include: readonly string[],
    exclude: readonly string[],
  ): Promise<string[]> {
    const yes = include.map(globRegex);
    const no = exclude.map(globRegex);
    return Object.keys(this.files).filter((path) => {
      if (!path.startsWith(`${folder}/`)) return false;
      const rel = path.slice(folder.length + 1);
      return yes.some((r) => r.test(rel)) && !no.some((r) => r.test(rel));
    });
  }

  /** The text of a file. */
  async read(path: string): Promise<string | undefined> {
    return this.files[path];
  }
}

/** Result files held in memory, each with a change time. */
export class ResultFilesMock implements IResultFiles {
  constructor(
    private readonly files: Record<string, { mtime: number; text: string }>,
  ) {}

  /** Files under the folder changed at or after the time. */
  async list(dir: string, _depth: number, sinceMs: number): Promise<string[]> {
    return Object.entries(this.files)
      .filter(([path, f]) => path.startsWith(`${dir}/`) && f.mtime >= sinceMs)
      .map(([path]) => path);
  }

  /** The text of a file. */
  async read(path: string): Promise<string | undefined> {
    return this.files[path]?.text;
  }
}

/** A process that records its commands and returns a fixed exit code. */
export class ProcessMock implements IProcessRunner {
  /** The commands run so far. */
  readonly commands: {
    command: string;
    cwd: string;
    env: Readonly<Record<string, string>>;
  }[] = [];

  constructor(
    private readonly exit: null | number = 0,
    private readonly fail = false,
  ) {}

  /** Records the command and returns the fixed exit code. */
  async run(
    command: string,
    options: {
      cwd: string;
      env: Readonly<Record<string, string>>;
      onOutput: (t: string) => void;
    },
  ): Promise<null | number> {
    if (this.fail) throw new Error("spawn failed");
    this.commands.push({ command, cwd: options.cwd, env: options.env });
    options.onOutput("runner output\n");
    return this.exit;
  }
}

/** A reporter that records what it was told. */
export class ReporterMock implements IRunReporter {
  /** What the reporter was told, in order. */
  readonly events: string[] = [];
  /** The last result per test ID. */
  readonly results = new Map<
    string,
    ReturnType<IRunReporter["result"]> | unknown
  >();

  /** Records an error. */
  errored(test: ResolvedTest, message: string): void {
    this.events.push(`errored ${test.declaration.id}: ${message}`);
  }

  /** Records output. */
  output(text: string): void {
    this.events.push(`output ${text.trim()}`);
  }

  /** Records a result. */
  result(
    test: ResolvedTest,
    result: Parameters<IRunReporter["result"]>[1],
  ): void {
    this.results.set(test.declaration.id, result);
    this.events.push(`result ${test.declaration.id}: ${result.outcome}`);
  }

  /** Records a start. */
  started(test: ResolvedTest): void {
    this.events.push(`started ${test.declaration.id}`);
  }
}
