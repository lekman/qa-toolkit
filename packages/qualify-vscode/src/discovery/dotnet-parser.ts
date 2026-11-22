import type { Declaration } from "./types";

import { CallArguments } from "./call-arguments";
import { SourceScanner } from "./source-scanner";
import { Syntaxes } from "./syntaxes";

const ATTRIBUTE =
  /(?<=[[,]\s*)(?:Lekman\.Qualify\.)?(IQ|OQ|PQ|IU)(?:Attribute)?\s*\(/g;
const CLASS = /\b(?:class|record)\s+([A-Za-z_]\w*)/g;
const METHOD = /([A-Za-z_]\w*)\s*(?:<[^>()]*>)?\s*\(/;

/**
 * Reads `[IQ]`, `[OQ]`, `[PQ]` and `[IU]` attributes from a C# file that
 * uses `Lekman.Qualify`, with the class and method each one is on.
 */
export class DotnetParser {
  /** The declarations in a file, or none when it does not use qualify. */
  static parse(file: string, text: string): Declaration[] {
    if (!text.includes("Lekman.Qualify")) return [];
    const masked = SourceScanner.mask(text, Syntaxes.DOTNET);
    const source = { masked, text };
    const found: Declaration[] = [];
    for (const match of masked.matchAll(ATTRIBUTE)) {
      const open = match.index + match[0].length - 1;
      const close = SourceScanner.close(masked, open);
      const args = SourceScanner.split(text, masked, open, close);
      const classes = [...masked.slice(0, match.index).matchAll(CLASS)];
      const className = classes[classes.length - 1]?.[1];
      const method = DotnetParser.method(masked, close + 1);
      found.push(
        CallArguments.declaration(
          source,
          {
            file,
            framework: "xunit",
            language: "dotnet",
            level: match[1] as "OQ",
            line: SourceScanner.line(text, match.index),
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

  /** The method after the attribute list that ends at or after `from`. */
  private static method(masked: string, from: number): string | undefined {
    let i = masked.indexOf("]", from);
    if (i < 0) return undefined;
    i++;
    for (;;) {
      while (/\s/.test(masked[i] ?? "")) i++;
      if (masked[i] !== "[") break;
      i = SourceScanner.close(masked, i) + 1;
    }
    return METHOD.exec(masked.slice(i))?.[1];
  }
}
