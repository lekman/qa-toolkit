import type { Declaration } from "./types";

import { CallArguments } from "./call-arguments";
import { SourceScanner } from "./source-scanner";
import { Syntaxes } from "./syntaxes";

const ANNOTATION = /@(?:com\.lekman\.qualify\.)?(IQ|OQ|PQ|IU)\s*\(/g;
const CLASS = /\b(?:class|object)\s+([A-Za-z_]\w*)/g;
const METHOD = /\bfun\s+(?:`([^`]+)`|([A-Za-z_]\w*))\s*\(|([A-Za-z_]\w*)\s*\(/g;
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return"]);

/**
 * Reads `@IQ`, `@OQ`, `@PQ` and `@IU` annotations from a Java or Kotlin file
 * that uses `com.lekman.qualify`, with the class and method each one is on,
 * which the JUnit filters select by.
 */
export class JvmParser {
  /** The declarations in a file, or none when it does not use qualify. */
  static parse(file: string, text: string): Declaration[] {
    if (!text.includes("com.lekman.qualify")) return [];
    const masked = SourceScanner.mask(text, Syntaxes.JVM);
    const source = { masked, text };
    const found: Declaration[] = [];
    for (const match of masked.matchAll(ANNOTATION)) {
      const open = match.index + match[0].length - 1;
      const close = SourceScanner.close(masked, open);
      const args = SourceScanner.split(text, masked, open, close);
      const classes = [...masked.slice(0, match.index).matchAll(CLASS)];
      const className = classes[classes.length - 1]?.[1];
      const method = JvmParser.method(masked.slice(close + 1));
      found.push(
        CallArguments.declaration(
          source,
          {
            file,
            framework: "junit",
            language: "jvm",
            level: match[1] as "OQ",
            line: SourceScanner.line(text, match.index),
            ...(method === undefined ? {} : { method }),
            ...(className === undefined ? {} : { className }),
          },
          args,
          [],
        ),
      );
    }
    return found;
  }

  /** The first method declared in the text, skipping other annotations. */
  private static method(rest: string): string | undefined {
    for (const m of rest.matchAll(METHOD)) {
      if (m[1] !== undefined || m[2] !== undefined) return m[1] ?? m[2];
      const name = m[3] as string;
      if (rest[m.index - 1] === "@" || KEYWORDS.has(name)) continue;
      if (/@[\w.]*$/.test(rest.slice(0, m.index))) continue;
      return name;
    }
    return undefined;
  }
}
