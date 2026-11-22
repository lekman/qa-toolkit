import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import type { IFiles } from "../run";

/** Folders a repository scan never enters. */
const SKIP = new Set([
  ".git",
  ".venv",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "obj",
  "qa-results",
  "target",
]);

/** The file system, through Node. */
export class NodeFiles implements IFiles {
  /** Every folder under the root, down to a depth, relative to it, with `.` for the root. */
  static async folders(root: string, depth: number): Promise<string[]> {
    const out = ["."];
    const walk = async (rel: string, left: number): Promise<void> => {
      const entries = await readdir(join(root, rel), {
        withFileTypes: true,
      }).catch(() => []);
      for (const e of entries) {
        if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith("."))
          continue;
        const child = rel === "." ? e.name : `${rel}/${e.name}`;
        out.push(child);
        if (left > 1) await walk(child, left - 1);
      }
    };
    await walk(".", depth);
    return out;
  }

  /** The file names of each folder, for finding tools such as `gradlew`. */
  static async index(dirs: readonly string[]): Promise<Map<string, string[]>> {
    const index = new Map<string, string[]>();
    for (const dir of new Set(dirs)) {
      const entries = await readdir(dir, { withFileTypes: true }).catch(
        () => [],
      );
      index.set(
        dir,
        entries.filter((e) => e.isFile()).map((e) => e.name),
      );
    }
    return index;
  }

  /** Files directly in a folder changed at or after a time. */
  async list(dir: string, sinceMs: number): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const path = join(dir, e.name);
      const info = await stat(path).catch(() => undefined);
      if (info !== undefined && info.mtimeMs >= sinceMs) out.push(path);
    }
    return out;
  }

  /** Creates a folder and its parents. */
  async mkdir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /** A file's text, or `undefined` when it cannot be read. */
  async read(path: string): Promise<string | undefined> {
    return readFile(path, "utf8").catch(() => undefined);
  }

  /** Empties the CLI's own output folder. */
  async reset(dir: string): Promise<void> {
    await rm(dir, { force: true, recursive: true });
    await mkdir(dir, { recursive: true });
  }

  /** Writes a file, creating its folder. */
  async write(path: string, text: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  }
}
