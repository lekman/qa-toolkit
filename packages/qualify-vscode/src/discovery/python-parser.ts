import type { Declaration } from "./types";

import { CallArguments } from "./call-arguments";
import { SourceScanner } from "./source-scanner";
import { Syntaxes } from "./syntaxes";

const IMPORT = /^\s*(?:import\s+qualify\b|from\s+qualify\b)/m;
const DECORATOR =
  /^[ \t]*@[ \t]*(?:[A-Za-z_]\w*[ \t]*\.[ \t]*)?(iq|oq|pq|iu)[ \t]*\(/gm;
const DEF = /\bdef\s+([A-Za-z_]\w*)/;
const CLASS = /^class\s+([A-Za-z_]\w*)/gm;

/**
 * Reads `@qualify.iq`, `oq`, `pq` and `iu` decorators from a Python file that
 * imports qualify, and the name of the test function each one decorates.
 */
export class PythonParser {
  /** The declarations in a file, or none when it does not import qualify. */
  static parse(file: string, text: string): Declaration[] {
    if (!IMPORT.test(text)) return [];
    const masked = SourceScanner.mask(text, Syntaxes.PYTHON);
    const source = { masked, text };
    const found: Declaration[] = [];
    for (const match of masked.matchAll(DECORATOR)) {
      const open = match.index + match[0].length - 1;
      const close = SourceScanner.close(masked, open);
      const args = SourceScanner.split(text, masked, open, close);
      const method = DEF.exec(masked.slice(close))?.[1];
      const classes = [...masked.slice(0, match.index).matchAll(CLASS)];
      const className = classes[classes.length - 1]?.[1];
      const at = match.index + match[0].indexOf("@");
      found.push(
        CallArguments.declaration(
          source,
          {
            file,
            framework: "pytest",
            language: "python",
            level: (match[1] as string).toUpperCase() as "OQ",
            line: SourceScanner.line(text, at),
            ...(method === undefined ? {} : { method }),
            ...(className === undefined ? {} : { className }),
          },
          args,
          ["id", "title"],
        ),
      );
    }
    return found;
  }
}
