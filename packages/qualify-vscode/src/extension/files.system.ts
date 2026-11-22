import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";

import type { IResultFiles } from "../results";
import type { IWorkspaceFiles } from "../workspace";

/** Finds files with VS Code's file search and reads them from disk. */
export class WorkspaceFiles implements IWorkspaceFiles {
  /** Files under a folder that match the globs, with VS Code's file search. */
  async find(
    folder: string,
    include: readonly string[],
    exclude: readonly string[],
  ): Promise<string[]> {
    const base = vscode.Uri.file(folder);
    const skip = exclude.length > 0 ? `{${exclude.join(",")}}` : undefined;
    const found = await Promise.all(
      include.map((glob) =>
        vscode.workspace.findFiles(
          new vscode.RelativePattern(base, glob),
          skip,
        ),
      ),
    );
    return [...new Set(found.flat().map((uri) => uri.fsPath))];
  }

  /** Creates a folder and its parents. */
  async mkdir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /** The text of a file, or `undefined` when it cannot be read. */
  async read(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, "utf8");
    } catch {
      return undefined;
    }
  }
}

/** Lists and reads result files with Node's file system. */
export class ResultFiles implements IResultFiles {
  /** Files under a folder, down to a depth, changed at or after a time. */
  async list(dir: string, depth: number, sinceMs: number): Promise<string[]> {
    const out: string[] = [];
    const walk = async (at: string, left: number): Promise<void> => {
      let entries;
      try {
        entries = await readdir(at, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const path = join(at, entry.name);
        if (entry.isDirectory()) {
          if (left > 0) await walk(path, left - 1);
        } else if (entry.isFile()) {
          const info = await stat(path).catch(() => undefined);
          if (info !== undefined && info.mtimeMs >= sinceMs) out.push(path);
        }
      }
    };
    await walk(dir, depth);
    return out;
  }

  /** Creates a folder and its parents. */
  async mkdir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /** The text of a file, or `undefined` when it cannot be read. */
  async read(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, "utf8");
    } catch {
      return undefined;
    }
  }
}
