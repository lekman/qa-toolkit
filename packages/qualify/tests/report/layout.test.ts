import { describe, expect, test } from "bun:test";

import type { Block, DrawOp, ITextMetrics } from "../../src/report";

import { Layout, PAGE } from "../../src/report";

/** Every character is half the font size wide; no character is missing. */
const metrics: ITextMetrics = {
  canDraw: () => true,
  width: (text, size) => [...text].length * size * 0.5,
};

const texts = (ops: DrawOp[]): string[] =>
  ops.flatMap((op) => (op.kind === "text" ? [op.text] : []));

describe("Layout.wrap", () => {
  test("wraps at spaces, keeps line breaks, splits a long word", () => {
    expect(Layout.wrap("aa bb cc", 20, 10, false, metrics)).toEqual([
      "aa",
      "bb",
      "cc",
    ]);
    expect(Layout.wrap("aa bb cc", 25, 10, false, metrics)).toEqual([
      "aa bb",
      "cc",
    ]);
    expect(Layout.wrap("aa bb\ncc", 100, 10, false, metrics)).toEqual([
      "aa bb",
      "cc",
    ]);
    expect(Layout.wrap("abcdefgh", 20, 10, false, metrics)).toEqual([
      "abcd",
      "efgh",
    ]);
    expect(Layout.wrap("", 20, 10, false, metrics)).toEqual([""]);
  });
});

describe("Layout.paginate", () => {
  test("stays inside the margins and breaks pages", () => {
    const blocks: Block[] = [
      { kind: "title", text: "Report" },
      {
        kind: "paragraph",
        text: Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"),
      },
    ];
    const pages = Layout.paginate(blocks, metrics);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      for (const op of page) {
        if (op.kind !== "text") continue;
        expect(op.y).toBeGreaterThanOrEqual(PAGE.margin - 1);
        expect(op.y).toBeLessThanOrEqual(PAGE.height - PAGE.margin);
        expect(op.x).toBeGreaterThanOrEqual(PAGE.margin);
      }
    }
    expect(pages.flatMap(texts)).toContain("line 199");
  });

  test("a page break starts a page once", () => {
    const pages = Layout.paginate(
      [
        { kind: "pageBreak" },
        { kind: "paragraph", text: "a" },
        { kind: "pageBreak" },
        { kind: "pageBreak" },
        { kind: "paragraph", text: "b" },
      ],
      metrics,
    );
    expect(pages.map(texts)).toEqual([["a"], ["b"]]);
  });

  test("a table row moves to the next page whole, and the header repeats", () => {
    const rows = Array.from({ length: 80 }, (_, i) => [`r${i}`, "x y z"]);
    const pages = Layout.paginate(
      [
        {
          kind: "table",
          columns: [
            { header: "H1", width: 0.5 },
            { header: "H2", width: 0.5 },
          ],
          rows,
        },
      ],
      metrics,
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(texts(page)[0]).toBe("H1");
    const all = pages.flatMap(texts);
    for (let i = 0; i < 80; i++)
      expect(all.filter((t) => t === `r${i}`)).toHaveLength(1);
  });

  test("a row taller than a page splits across pages", () => {
    const tall = Array.from({ length: 120 }, (_, i) => `w${i}`).join("\n");
    const pages = Layout.paginate(
      [{ kind: "fields", rows: [["Label", tall]] }],
      metrics,
    );
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap(texts)).toContain("w119");
  });

  test("lists, headings and signatures", () => {
    const pages = Layout.paginate(
      [
        { kind: "heading", level: 1, text: "Head" },
        { kind: "list", items: ["one", "two"] },
        { kind: "heading", level: 2, text: "Sub" },
        { kind: "signatures", roles: ["Prepared by", "Approved by"] },
      ],
      metrics,
    );
    expect(pages.flatMap(texts)).toEqual([
      "Head",
      "•",
      "one",
      "•",
      "two",
      "Sub",
      "Prepared by",
      "Name",
      "Signature",
      "Date",
      "Approved by",
      "Name",
      "Signature",
      "Date",
    ]);
    expect(pages[0]?.filter((op) => op.kind === "line")).toHaveLength(6);
  });

  test("a heading near the bottom moves to the next page with its content", () => {
    const filler = Array.from({ length: 57 }, (_, i) => `f${i}`).join("\n");
    const pages = Layout.paginate(
      [
        { kind: "paragraph", text: filler },
        { kind: "heading", level: 1, text: "Late" },
        { kind: "paragraph", text: "body" },
      ],
      metrics,
    );
    expect(texts(pages.at(-1) as DrawOp[])).toEqual(["Late", "body"]);
  });
});
