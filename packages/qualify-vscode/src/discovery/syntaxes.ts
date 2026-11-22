import type { Syntax } from "./types";

/** How each language writes comments and strings. */
export class Syntaxes {
  /** C#: verbatim `@"…"` and raw `"""…"""` strings. */
  static readonly DOTNET: Syntax = {
    blockComment: ["/*", "*/"],
    escapes: true,
    lineComment: "//",
    quotes: ['"', "'"],
    triple: true,
    verbatim: true,
  };

  /** Java and Kotlin: text blocks and raw strings in `"""`. */
  static readonly JVM: Syntax = {
    blockComment: ["/*", "*/"],
    escapes: true,
    lineComment: "//",
    quotes: ['"', "'"],
    triple: true,
    verbatim: false,
  };

  /** Python: `#` comments and triple-quoted strings. */
  static readonly PYTHON: Syntax = {
    escapes: true,
    lineComment: "#",
    quotes: ['"', "'"],
    triple: true,
    verbatim: false,
  };

  /** TypeScript and JavaScript: template literals in backticks. */
  static readonly TYPESCRIPT: Syntax = {
    blockComment: ["/*", "*/"],
    escapes: true,
    lineComment: "//",
    quotes: ['"', "'", "`"],
    triple: false,
    verbatim: false,
  };
}
