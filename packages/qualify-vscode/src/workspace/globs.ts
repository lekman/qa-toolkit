/** A glob as a regular expression: double star, star, question mark, braces and character classes. */
const toRegExp = (glob: string): RegExp => {
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
    else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end < 0) out += "\\[";
      else {
        out += `[${glob
          .slice(i + 1, end)
          .replace(/^!/, "^")
          .replace(/\\/g, "\\\\")}]`;
        i = end;
      }
    } else out += c.replace(/[.+^$()|\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};

/** Matches paths against the globs of the settings, the way VS Code's file search reads them. */
export class Globs {
  /** Whether a path, relative to its workspace folder with `/`, matches any of the globs. */
  static matchesAny(path: string, globs: readonly string[]): boolean {
    return globs.some((g) => toRegExp(g).test(path));
  }
}
