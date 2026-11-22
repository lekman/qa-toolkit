import { describe, expect, test } from "bun:test";

import type { TokenValues } from "../../src/theme";

import { Template, ThemeError } from "../../src/theme";

const values: TokenValues = {
  title: "T",
  classification: "C",
  documentId: "D",
  environment: "e",
  levels: "IQ",
  date: "2026-01-02",
  version: "1",
  verdict: "Passed",
  runId: "R",
  sha12: "abc",
};

describe("Template", () => {
  test("renders tokens and brace escapes", () => {
    expect(
      Template.render("{title} {{x}} {page}/{pages} {sha12}", {
        ...values,
        page: "2",
        pages: "5",
      }),
    ).toBe("T {x} 2/5 abc");
    expect(Template.render("{page}", values)).toBe("");
  });

  test("validate names an unknown token", () => {
    expect(() =>
      Template.validate({ footer: "{documentId} {nope}" }, "t.json"),
    ).toThrow("t.json: texts.footer uses {nope}");
  });

  test("page tokens only in the header and footer; title and classification not in themselves", () => {
    expect(() =>
      Template.validate(
        {
          header: "{page}",
          footer: "{pages}",
          subtitle: "{title} {classification}",
        },
        "t",
      ),
    ).not.toThrow();
    expect(() => Template.validate({ subtitle: "{page}" }, "t")).toThrow(
      ThemeError,
    );
    expect(() => Template.validate({ title: "{title}" }, "t")).toThrow(
      ThemeError,
    );
    expect(() => Template.validate({ classification: "{title}" }, "t")).toThrow(
      ThemeError,
    );
  });

  test("unbalanced braces", () => {
    expect(() => Template.parse("a { b", "w")).toThrow('a "{" is not closed');
    expect(() => Template.parse("a } b", "w")).toThrow('a "}" has no "{"');
    expect(Template.parse("{{}}", "w")).toEqual([{ text: "{}" }]);
  });
});
