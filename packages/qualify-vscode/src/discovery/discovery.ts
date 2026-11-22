import type { Declaration, Language } from "./types";

import { DotnetParser } from "./dotnet-parser";
import { GherkinParser } from "./gherkin-parser";
import { JvmParser } from "./jvm-parser";
import { PythonParser } from "./python-parser";
import { TypeScriptParser } from "./typescript-parser";

/** A parser for one language, chosen by file extension. */
interface Parser {
  extensions: readonly string[];
  language: Language;
  parse(file: string, text: string): Declaration[];
}

const PARSERS: readonly Parser[] = [
  {
    extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
    language: "typescript",
    parse: TypeScriptParser.parse,
  },
  { extensions: [".py"], language: "python", parse: PythonParser.parse },
  {
    extensions: [".java", ".kt", ".kts"],
    language: "jvm",
    parse: JvmParser.parse,
  },
  { extensions: [".cs"], language: "dotnet", parse: DotnetParser.parse },
  { extensions: [".feature"], language: "gherkin", parse: GherkinParser.parse },
];

/** Finds the tests a file declares by reading its text, without running anything. */
export class Discovery {
  /** The file extensions discovery reads, with the dot. */
  static readonly EXTENSIONS: readonly string[] = PARSERS.flatMap(
    (p) => p.extensions,
  );

  /** The language of a file, from its extension. */
  static languageOf(file: string): Language | undefined {
    return Discovery.parserOf(file)?.language;
  }

  /** The tests a file declares; none for a file in a language discovery does not read. */
  static parse(file: string, text: string): Declaration[] {
    return Discovery.parserOf(file)?.parse(file, text) ?? [];
  }

  private static parserOf(file: string): Parser | undefined {
    const lower = file.toLowerCase();
    return PARSERS.find((p) => p.extensions.some((e) => lower.endsWith(e)));
  }
}
