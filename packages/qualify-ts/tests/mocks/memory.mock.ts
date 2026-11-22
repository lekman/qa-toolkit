import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ICliIO } from "../../src/cli";
import type { GitFacts, IGitProbe } from "../../src/envelope";
import type { IEvidenceWriter } from "../../src/evidence";

const REPO = resolve(import.meta.dir, "../../../..");

/** Keeps written files in memory. */
export class MemoryWriter implements IEvidenceWriter {
  /** Written files by path. */
  files = new Map<string, string | Uint8Array>();

  /** Keep the content under its path. */
  async write(path: string, content: string | Uint8Array): Promise<void> {
    this.files.set(path, content);
  }
}

/** Returns fixed git facts. */
export class GitMock implements IGitProbe {
  /** Facts to return; a clean repository at /repo by default. */
  constructor(
    private readonly facts: GitFacts = {
      root: "/repo",
      commit: "0123456789abcdef0123456789abcdef01234567",
      branch: "main",
      dirty: false,
    },
  ) {}

  /** The fixed facts. */
  read(): GitFacts {
    return this.facts;
  }
}

/** A clock that moves forward 5 ms on every reading. */
export const steppingClock = (
  start = Date.UTC(2026, 0, 2, 3, 4, 5, 0),
): (() => Date) => {
  let now = start;
  return () => {
    const date = new Date(now);
    now += 5;
    return date;
  };
};

/** CLI I/O over an in-memory file system. */
export class MemoryCliIO implements ICliIO {
  /** Everything written to standard error. */
  readonly err: string[] = [];
  /** The file system, by absolute path. */
  readonly files: Map<string, Uint8Array | string>;
  /** Git facts for a clean repository. */
  readonly git: IGitProbe = new GitMock();
  /** A clock that steps 5 ms per reading. */
  now = steppingClock();
  /** Everything written to standard output. */
  readonly out: string[] = [];
  /** Writes into `files`. */
  readonly writer: MemoryWriter;

  /** Start with these files and environment variables. */
  constructor(
    files: Record<string, string> = {},
    readonly env: Record<string, string | undefined> = {},
  ) {
    this.files = new Map(Object.entries(files));
    this.writer = new MemoryWriter();
    this.writer.files = this.files;
  }

  /** Always /work. */
  cwd(): string {
    return "/work";
  }

  /** Names directly inside a directory. */
  async list(dir: string): Promise<string[] | undefined> {
    const prefix = `${dir}/`;
    const names = [...this.files.keys()]
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length))
      .filter((n) => !n.includes("/"));
    return names.length > 0 ? names : undefined;
  }

  /** Fixed bytes. */
  random(size: number): Uint8Array {
    return new Uint8Array(size).fill(7);
  }

  /** A file's bytes, or ENOENT. */
  async readBytes(path: string): Promise<Uint8Array> {
    const content = this.files.get(path);
    if (content === undefined) {
      // Theme files live on disk: the bundled themes and the spec's fixtures.
      if (path.startsWith(REPO)) return new Uint8Array(readFileSync(path));
      throw new Error(`ENOENT: ${path}`);
    }
    return typeof content === "string"
      ? new Uint8Array(Buffer.from(content))
      : content;
  }

  /** A fixed runtime. */
  runtime(): string {
    return "node 22.0.0";
  }

  /** Collect standard error. */
  stderr(text: string): void {
    this.err.push(text);
  }

  /** Collect standard output. */
  stdout(text: string): void {
    this.out.push(text);
  }

  /** A file as text, for assertions. */
  text(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`no file ${path}`);
    return typeof content === "string"
      ? content
      : Buffer.from(content).toString("utf8");
  }

  /** The package's real bundled themes. */
  themesDir(): string {
    return join(import.meta.dir, "../../themes");
  }

  /** Collect warnings with standard error. */
  warn(message: string): void {
    this.err.push(message);
  }
}
