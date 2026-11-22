import type { Declaration, Framework } from "./types";

import { CallArguments } from "./call-arguments";
import { SourceScanner } from "./source-scanner";
import { Syntaxes } from "./syntaxes";

const IMPORT = /["']@lekman\/qualify(?:\/(vitest|node|bun))?["']/g;
const CALL = /(?<![\w$.])(?:[A-Za-z_$][\w$]*\s*\.\s*)?(iq|oq|pq|iu)\s*\(/g;

/**
 * Reads `iq`, `oq`, `pq` and `iu` calls from a TypeScript or JavaScript file
 * that imports `@lekman/qualify`. The import path picks the runner:
 * `/vitest`, `/node` or `/bun`, and vitest when the file names none.
 */
export class TypeScriptParser {
  /** The declarations in a file, or none when it does not import qualify. */
  static parse(file: string, text: string): Declaration[] {
    const adapters = [...text.matchAll(IMPORT)];
    if (adapters.length === 0) return [];
    const framework = (adapters.find((m) => m[1] !== undefined)?.[1] ??
      "vitest") as Framework;
    const masked = SourceScanner.mask(text, Syntaxes.TYPESCRIPT, true);
    const source = { masked, text };
    const found: Declaration[] = [];
    for (const match of masked.matchAll(CALL)) {
      const before = masked.slice(Math.max(0, match.index - 12), match.index);
      if (/\bfunction\s*$/.test(before)) continue;
      const open = match.index + match[0].length - 1;
      const close = SourceScanner.close(masked, open);
      const args = SourceScanner.split(text, masked, open, close);
      const options = args[2];
      let named = args.slice(0, 2);
      let readable = false;
      if (options !== undefined && masked[options.start] === "{") {
        const end = SourceScanner.close(masked, options.start);
        const inner = SourceScanner.split(text, masked, options.start, end);
        readable = !inner.some((a) => a.text.startsWith("..."));
        named = [...named, ...inner];
      }
      found.push(
        CallArguments.declaration(
          source,
          {
            file,
            framework,
            language: "typescript",
            level: (match[1] as string).toUpperCase() as "OQ",
            line: SourceScanner.line(text, match.index),
          },
          named,
          ["id", "title"],
          readable,
        ),
      );
    }
    return found;
  }
}
