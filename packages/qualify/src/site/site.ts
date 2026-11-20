import { dirname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Frame } from "./types";

// `path:line:column`, or `path:line` as Bun writes some frames.
const WITH_COLUMN = /^(.*):(\d+):(\d+)$/;
const WITHOUT_COLUMN = /^(.*):(\d+)$/;

const frameLocation = (line: string): string | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("at ")) return undefined;
  const body = trimmed.slice(3);
  const open = body.lastIndexOf("(");
  if (body.endsWith(")") && open >= 0) return body.slice(open + 1, -1);
  return body.replace(/^async /, "");
};

const toPath = (location: string): string | undefined => {
  let path = location.replace(/[?#][^:]*$/, "");
  if (path.startsWith("file://")) {
    try {
      path = fileURLToPath(path);
    } catch {
      return undefined;
    }
  }
  return isAbsolute(path) ? path : undefined;
};

/**
 * Sites: the repository-relative `path:line` of a declaration, a check or a
 * failure, read from stack traces.
 */
export class Site {
  /**
   * The first frame outside qualify's own code and outside `node_modules`:
   * the test file line that called into qualify.
   */
  static caller(
    stack: string | undefined,
    exclude: readonly string[],
  ): Frame | undefined {
    return Site.frames(stack).find(
      (frame) => !Site.excluded(frame.path, exclude),
    );
  }

  /**
   * Format a frame as `path:line`, relative to `root` with forward slashes.
   * A path that cannot be made relative without a colon keeps its base name.
   */
  static format(frame: Frame, root: string): string {
    let path = relative(root, frame.path).split(sep).join("/");
    if (path.length === 0 || path.includes(":")) {
      path = frame.path.split(/[\\/]/).pop() ?? "unknown";
    }
    return `${path.replace(/[:\n]/g, "_")}:${frame.line}`;
  }

  /** Every frame of a V8 or JavaScriptCore stack trace that names a file. */
  static frames(stack: string | undefined): Frame[] {
    if (stack === undefined) return [];
    const frames: Frame[] = [];
    for (const line of stack.split("\n")) {
      const location = frameLocation(line);
      if (location === undefined) continue;
      const match = WITH_COLUMN.exec(location) ?? WITHOUT_COLUMN.exec(location);
      if (!match) continue;
      const path = toPath(match[1] as string);
      if (path === undefined) continue;
      frames.push({ path, line: Number(match[2]) });
    }
    return frames;
  }

  /** The innermost frame of a stack that lies in the given file. */
  static inFile(stack: string | undefined, path: string): Frame | undefined {
    return Site.frames(stack).find((frame) => frame.path === path);
  }

  /**
   * The folder holding qualify's own code: the nearest ancestor of a module
   * named `src` or `dist`. Frames inside it are never a test's site.
   */
  static ownRoot(moduleUrl: string): string {
    let dir = dirname(fileURLToPath(moduleUrl));
    for (;;) {
      const name = dir.split(/[\\/]/).pop();
      if (name === "src" || name === "dist") return dir;
      const parent = dirname(dir);
      if (parent === dir) return dirname(fileURLToPath(moduleUrl));
      dir = parent;
    }
  }

  private static excluded(path: string, exclude: readonly string[]): boolean {
    if (/[\\/]node_modules[\\/]/.test(path)) return true;
    return exclude.some(
      (root) =>
        path === root ||
        path.startsWith(root.endsWith(sep) ? root : root + sep),
    );
  }
}
