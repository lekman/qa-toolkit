import { dirname, relative } from "node:path";

/**
 * Turns the lines of a `.gitignore` into globs that discovery skips. It
 * reads the common forms: a name (`dist`), a folder (`out/`), a path from
 * the file's folder (`/docs/plans`) and wildcards. A
 * line that starts with `!` is not read, so what it brings back stays
 * skipped when an earlier line skips it; a line with `{`, `}` or `,`, which
 * a VS Code glob reads differently, is not read either.
 */
export class GitIgnore {
  /** The file name. */
  static readonly FILE = ".gitignore";

  /** The globs of one `.gitignore`, relative to the workspace folder. */
  static globs(folder: string, file: string, text: string): string[] {
    const dir = relative(folder, dirname(file)).split("\\").join("/");
    const prefix = dir.length === 0 ? "" : `${dir}/`;
    if (prefix.startsWith("../")) return [];
    return text.split(/\r?\n/).flatMap((raw) => {
      let line = raw.replace(/\s+$/, "");
      if (
        line.length === 0 ||
        line.startsWith("#") ||
        line.startsWith("!") ||
        line.startsWith("\\") ||
        /[{},]/.test(line)
      ) {
        return [];
      }
      const folderOnly = line.endsWith("/");
      line = line.replace(/\/+$/, "");
      if (line.length === 0) return [];
      const anchored = line.includes("/");
      line = line.replace(/^\/+/, "");
      const base = anchored ? `${prefix}${line}` : `${prefix}**/${line}`;
      return folderOnly ? [`${base}/**`] : [base, `${base}/**`];
    });
  }
}
