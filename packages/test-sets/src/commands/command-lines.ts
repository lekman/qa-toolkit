import { dirname, relative } from "node:path";

import type { RunnerDefinition, SelectedTest, Selection } from "../runners";
import type { FileIndex } from "./types";

const PLACEHOLDER = /\$\{(\w+)\}/g;

/** Builds the command line that runs a selection of tests with a runner. */
export class CommandLines {
  /** The template with each `${name}` that `values` holds replaced; other placeholders stay. */
  static fill(
    template: string,
    values: Readonly<Record<string, string>>,
  ): string {
    return template.replace(PLACEHOLDER, (whole, name: string) =>
      Object.hasOwn(values, name) ? (values[name] as string) : whole,
    );
  }

  /**
   * The runner's own filter for the tests, such as `-t '\[OQ-A-001\]'` for
   * vitest. A term that uses `${class}` or `${method}` for a test without
   * one gets `*` there.
   */
  static filter(
    select: Selection,
    tests: readonly SelectedTest[],
    platform: string,
  ): string {
    const terms = tests.map((t) =>
      CommandLines.fill(select.term, {
        class: t.className ?? "*",
        id: t.id,
        method: t.method ?? "*",
      }),
    );
    const quote = (s: string): string => CommandLines.quote(s, platform);
    if (select.repeat === true) {
      return terms
        .map((term) =>
          CommandLines.fill(select.argument, {
            term: select.quote === "none" ? term : quote(term),
          }),
        )
        .join(" ");
    }
    const each = select.quote === "each" ? terms.map(quote) : terms;
    const joined = each.join(select.join);
    return CommandLines.fill(select.argument, {
      terms: select.quote === "all" ? quote(joined) : joined,
    });
  }

  /**
   * The folder at or above `from`, up to `folder`, that holds a file named
   * `name`, or `undefined`.
   */
  static findUp(
    name: string,
    from: string,
    folder: string,
    index: FileIndex,
  ): string | undefined {
    let dir = from;
    for (;;) {
      if (index.get(dir)?.includes(name)) return dir;
      const rel = relative(folder, dir);
      const parent = dirname(dir);
      if (rel.length === 0 || rel.startsWith("..") || parent === dir) {
        return undefined;
      }
      dir = parent;
    }
  }

  /** A value quoted for the shell of the platform: single quotes, or double quotes on Windows. */
  static quote(value: string, platform: string): string {
    if (platform === "win32") return `"${value.replace(/"/g, '""')}"`;
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  /**
   * What `${tool}` becomes for a package: the first choice whose file is in
   * the package folder or a folder above it, up to the workspace folder.
   */
  static tool(
    definition: RunnerDefinition,
    root: string,
    folder: string,
    index: FileIndex,
  ): string {
    for (const choice of definition.tools) {
      if (choice.file === undefined) return choice.value;
      const dir = CommandLines.findUp(choice.file, root, folder, index);
      if (dir !== undefined) {
        const rel = relative(root, dir).split("\\").join("/");
        return CommandLines.fill(choice.value, {
          dir: rel.length === 0 ? "." : rel,
        });
      }
    }
    return "";
  }
}
