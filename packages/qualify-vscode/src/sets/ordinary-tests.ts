import type { Framework } from "@lekman/test-sets";

import type { OrdinaryCase } from "./types";

import { SourceScanner, Syntaxes } from "../discovery";

const JS_CALL =
  /(?<![\w$.])(?:test|it)(?:\s*\.\s*(?:only|skip|todo|concurrent|fails|fixme|slow))*\s*\(/g;
const PY_DEF = /^[ \t]*(?:async[ \t]+)?def[ \t]+(test_\w*)/gm;
const STORY = /^export\s+const\s+([A-Z]\w*)/gm;
const SCENARIO = /^[ \t]*(?:Scenario|Example):[ \t]*(.+)$/gm;
const JVM_METHOD = /\b(?:fun\s+(?:`([^`]+)`|(\w+))|void\s+(\w+))\s*\(/;
const DOTNET_METHOD = /\b(?:void|Task)\s+(\w+)\s*\(/;
/** How far after a test annotation its method is looked for. */
const REACH = 600;

/**
 * Reads the names of ordinary tests, those without a qualify ID, from a test
 * file without running it: `test` and `it` calls in JavaScript, `test_`
 * functions in Python, stories, scenarios, and JUnit and xUnit test
 * methods. A name built at run time is not found; the run adds it.
 */
export class OrdinaryTests {
  /** The test cases a file declares for a framework, in file order. */
  static cases(
    file: string,
    text: string,
    framework: Framework,
  ): OrdinaryCase[] {
    switch (framework) {
      case "pytest":
        return OrdinaryTests.matches(text, PY_DEF, (m) => m[1]);
      case "storybook":
        return OrdinaryTests.matches(text, STORY, (m) => m[1]);
      case "cucumber":
        return OrdinaryTests.matches(text, SCENARIO, (m) => m[1]?.trim());
      case "junit":
        return OrdinaryTests.annotated(
          text,
          SourceScanner.mask(text, Syntaxes.JVM),
          ["@Test"],
          JVM_METHOD,
        );
      case "xunit":
        return OrdinaryTests.annotated(
          text,
          SourceScanner.mask(text, Syntaxes.DOTNET),
          ["[Fact", "[Theory"],
          DOTNET_METHOD,
        );
      default:
        return file.endsWith(".mdx") ? [] : OrdinaryTests.javascript(text);
    }
  }

  /** The method after each marker, such as `@Test`, looked for a short way ahead. */
  private static annotated(
    text: string,
    masked: string,
    markers: readonly string[],
    method: RegExp,
  ): OrdinaryCase[] {
    const found: OrdinaryCase[] = [];
    for (const marker of markers) {
      let i = masked.indexOf(marker);
      while (i >= 0) {
        const next = masked[i + marker.length] ?? "";
        if (!/\w/.test(next)) {
          const m = method.exec(masked.slice(i, i + REACH));
          const name = m?.[1] ?? m?.[2] ?? m?.[3];
          if (name !== undefined)
            found.push({ line: SourceScanner.line(text, i), name });
        }
        i = masked.indexOf(marker, i + marker.length);
      }
    }
    return found.sort((a, b) => a.line - b.line);
  }

  private static javascript(text: string): OrdinaryCase[] {
    const masked = SourceScanner.mask(text, Syntaxes.TYPESCRIPT, true);
    const found: OrdinaryCase[] = [];
    for (const m of masked.matchAll(JS_CALL)) {
      const open = m.index + m[0].length - 1;
      const close = SourceScanner.close(masked, open);
      const [first] = SourceScanner.split(text, masked, open, close);
      if (first === undefined) continue;
      const name = SourceScanner.literal(text, masked, first);
      if (name !== undefined && name.length > 0) {
        found.push({ line: SourceScanner.line(text, m.index), name });
      }
    }
    return found;
  }

  private static matches(
    text: string,
    pattern: RegExp,
    pick: (m: RegExpExecArray) => string | undefined,
  ): OrdinaryCase[] {
    const found: OrdinaryCase[] = [];
    for (const m of text.matchAll(pattern)) {
      const name = pick(m);
      if (name !== undefined && name.length > 0) {
        found.push({ line: SourceScanner.line(text, m.index), name });
      }
    }
    return found;
  }
}
