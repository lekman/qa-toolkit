import { describe, expect, test } from "bun:test";

import { DeclarationRules, SourceScanner, Syntaxes } from "../../src/discovery";
import { declaration } from "../mocks/fixtures";

describe("SourceScanner", () => {
  test("masks comments and string contents, keeping offsets and line breaks", () => {
    const text = `a("x)", 'y') // c(\nb /* d( */ \`t\${1}\``;
    const masked = SourceScanner.mask(text, Syntaxes.TYPESCRIPT, true);
    expect(masked.length).toBe(text.length);
    expect(masked).toBe(`a("  ", ' ')      \nb          \`     \``);
  });

  test("an unterminated string ends at the line break", () => {
    const masked = SourceScanner.mask(`a("open\nb()`, Syntaxes.TYPESCRIPT);
    expect(masked).toBe(`a("    \nb()`);
  });

  test("an unterminated block comment runs to the end", () => {
    expect(SourceScanner.mask("a /* b(", Syntaxes.JVM)).toBe("a      ");
  });

  test("masks a regular expression literal but not a division", () => {
    const masked = SourceScanner.mask(
      `x = a / b; y = /["(]/g;`,
      Syntaxes.TYPESCRIPT,
      true,
    );
    expect(masked).toBe(`x = a / b; y = /    /g;`);
  });

  test("masks C# verbatim and raw strings", () => {
    const masked = SourceScanner.mask(
      `@"a""(" + """b(""" + 'c'`,
      Syntaxes.DOTNET,
    );
    expect(masked).toBe(`@"    " + """  """ + ' '`);
  });

  test("close finds the matching bracket, or the end", () => {
    expect(SourceScanner.close("f(a, [b], {c})", 1)).toBe(13);
    expect(SourceScanner.close("f(a", 1)).toBe(3);
  });

  test("identifier reads enum constants", () => {
    expect(SourceScanner.identifier("Risk.HIGH")).toBe("high");
    expect(SourceScanner.identifier("Scope.READ_WRITE")).toBe("read-write");
    expect(SourceScanner.identifier("Scope.ReadWrite")).toBe("read-write");
    expect(SourceScanner.identifier("[]")).toBeUndefined();
  });

  test("literal reads joined strings and refuses expressions", () => {
    const text = `f("a" + 'b', x + "c", r"d\\n")`;
    const masked = SourceScanner.mask(text, Syntaxes.PYTHON);
    const args = SourceScanner.split(text, masked, 1, text.length - 1);
    expect(args.map((a) => SourceScanner.literal(text, masked, a))).toEqual([
      "ab",
      undefined,
      "d\\n",
    ]);
  });

  test("named reads quoted keys and leaves positional strings with a colon alone", () => {
    const text = `{ "given": "g", 'when' : "w", "a: b" }`;
    const masked = SourceScanner.mask(text, Syntaxes.TYPESCRIPT);
    const args = SourceScanner.split(text, masked, 0, text.length - 1);
    expect(args.map((a) => SourceScanner.named(text, masked, a).key)).toEqual([
      "given",
      "when",
      undefined,
    ]);
  });

  test("strings unescapes", () => {
    const text = `["a\\"b", "c\\td"]`;
    const masked = SourceScanner.mask(text, Syntaxes.TYPESCRIPT);
    expect(SourceScanner.strings(text, masked, 0, text.length)).toEqual([
      'a"b',
      "c\td",
    ]);
  });
});

describe("DeclarationRules.duplicates", () => {
  test("marks every declaration of a repeated ID", () => {
    const a = declaration({ file: "/ws/a.ts", line: 1 });
    const b = declaration({ file: "/ws/b.ts", line: 2 });
    const c = declaration({ id: "OQ-OTHER-001" });
    const [da, db, dc] = DeclarationRules.duplicates([a, b, c]);
    expect(da?.problems).toEqual([
      "the ID OQ-EXPORT-001 is also declared at /ws/b.ts:2",
    ]);
    expect(db?.problems).toEqual([
      "the ID OQ-EXPORT-001 is also declared at /ws/a.ts:1",
    ]);
    expect(dc?.problems).toEqual([]);
  });
});
