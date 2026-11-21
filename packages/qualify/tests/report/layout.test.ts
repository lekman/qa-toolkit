import { describe, expect, test } from "bun:test";

import type {
  DrawOp,
  Field,
  Geometry,
  ITextMetrics,
  Page,
} from "../../src/report";

import { Layout } from "../../src/report";

/** Every character is half the font size wide; anything but U+FFFD can be drawn. */
const metrics: ITextMetrics = {
  canDraw: (code) => code !== 0xfffd,
  width: (text, size) => [...text].length * size * 0.5,
};
const A4: Geometry = { width: 595.28, height: 841.89, margin: 56.69 };

const texts = (ops: readonly DrawOp[]): string[] =>
  ops.flatMap((op) => (op.kind === "text" ? [op.text] : []));
const textOps = (ops: readonly DrawOp[]) =>
  ops.filter(
    (op): op is Extract<DrawOp, { kind: "text" }> => op.kind === "text",
  );

describe("Layout.wrap and fit", () => {
  test("wraps at spaces, keeps line breaks, splits a long word", () => {
    expect(Layout.wrap("aa bb cc", 20, 10, "body", metrics)).toEqual([
      "aa",
      "bb",
      "cc",
    ]);
    expect(Layout.wrap("aa bb cc", 25, 10, "body", metrics)).toEqual([
      "aa bb",
      "cc",
    ]);
    expect(Layout.wrap("aa bb\ncc", 100, 10, "body", metrics)).toEqual([
      "aa bb",
      "cc",
    ]);
    expect(Layout.wrap("abcdefgh", 20, 10, "body", metrics)).toEqual([
      "abcd",
      "efgh",
    ]);
  });

  test("fit cuts with an ellipsis", () => {
    expect(Layout.fit("short", 100, 10, "body", metrics)).toBe("short");
    expect(Layout.fit("abcdefghij", 25, 10, "body", metrics)).toBe("abcd…");
    expect(Layout.fit("abcdef", 3, 10, "body", metrics)).toBe("");
  });
});

describe("Layout.paginate", () => {
  test("stays inside the margins and breaks pages", () => {
    const pages = Layout.paginate(
      [
        {
          kind: "paragraph",
          text: Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"),
        },
      ],
      metrics,
      A4,
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const op of pages.flatMap(textOps)) {
      expect(op.y).toBeGreaterThanOrEqual(A4.margin - 1);
      expect(op.y).toBeLessThanOrEqual(A4.height - A4.margin);
    }
    expect(pages.flatMap(texts)).toContain("line 199");
  });

  test("a level 1 heading has an accent rule; mono fields use the mono font", () => {
    const [page] = Layout.paginate(
      [
        { kind: "heading", level: 1, text: "Title" },
        {
          kind: "fields",
          fields: [
            { label: "Run ID", value: "01H", mono: true },
            { label: "Branch", value: "main" },
          ],
        },
      ],
      metrics,
      A4,
    );
    const ops = page as Page;
    expect(ops.find((op) => op.kind === "line")).toMatchObject({
      colour: "accent",
      x1: A4.margin,
      x2: A4.width - A4.margin,
    });
    const runId = textOps(ops).find((op) => op.text === "01H");
    expect(runId).toMatchObject({ font: "mono" });
    expect(textOps(ops).find((op) => op.text === "Run ID")).toMatchObject({
      font: "bodyBold",
    });
    expect(textOps(ops).find((op) => op.text === "main")).toMatchObject({
      font: "body",
    });
  });

  test("tables: a filled header, zebra stripes, a repeated header, rows kept whole", () => {
    const rows = Array.from({ length: 90 }, (_, i) => [`r${i}`, "x y z"]);
    const pages = Layout.paginate(
      [
        {
          kind: "table",
          columns: [
            { header: "H1", width: 0.5 },
            { header: "H2", width: 0.5, mono: true },
          ],
          rows,
        },
      ],
      metrics,
      A4,
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(texts(page)[0]).toBe("H1");
      expect(page.find((op) => op.kind === "fill")).toMatchObject({
        colour: "tableHeader",
      });
      expect(textOps(page)[0]).toMatchObject({
        font: "bodyBold",
        colour: "tableHeaderText",
      });
    }
    const fills = pages.flatMap((p) => p.filter((op) => op.kind === "fill"));
    expect(
      fills.filter((op) => op.kind === "fill" && op.colour === "tableStripe"),
    ).toHaveLength(45);
    const all = pages.flatMap(texts);
    for (let i = 0; i < 90; i++)
      expect(all.filter((t) => t === `r${i}`)).toHaveLength(1);
    expect(
      textOps(pages[0] as Page).find((op) => op.text === "x y z"),
    ).toMatchObject({ font: "mono" });
  });

  test("a row taller than a page splits across pages", () => {
    const tall = Array.from({ length: 120 }, (_, i) => `w${i}`).join("\n");
    const pages = Layout.paginate(
      [{ kind: "fields", fields: [{ label: "Label", value: tall }] }],
      metrics,
      A4,
    );
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap(texts)).toContain("w119");
  });

  test("lists, headings, signatures and characters the font cannot draw", () => {
    const pages = Layout.paginate(
      [
        { kind: "heading", level: 2, text: "Head" },
        { kind: "list", items: ["one", "t�o"] },
        { kind: "heading", level: 3, text: "Sub" },
        { kind: "signatures", roles: ["Prepared by"] },
      ],
      metrics,
      A4,
    );
    expect(pages.flatMap(texts)).toEqual([
      "Head",
      "•",
      "one",
      "•",
      "t?o",
      "Sub",
      "Prepared by",
      "Name",
      "Signature",
      "Date",
    ]);
  });

  test("a heading near the bottom moves to the next page with its content", () => {
    const filler = Array.from({ length: 56 }, (_, i) => `f${i}`).join("\n");
    const pages = Layout.paginate(
      [
        { kind: "paragraph", text: filler },
        { kind: "heading", level: 2, text: "Late" },
        { kind: "paragraph", text: "body" },
      ],
      metrics,
      A4,
    );
    expect(texts(pages.at(-1) as Page)).toEqual(["Late", "body"]);
  });
});

describe("Layout.drawOrder and keep-with-next", () => {
  test("fills come first, so a stripe never covers the hairline above it", () => {
    const rows = Array.from({ length: 4 }, (_, i) => [`r${i}`]);
    const [page] = Layout.paginate(
      [{ kind: "table", columns: [{ header: "H", width: 1 }], rows }],
      metrics,
      A4,
    );
    const raw = page as Page;
    // Laid out row by row, a stripe's fill follows the line of the row above.
    const firstStripe = raw.findIndex(
      (op) => op.kind === "fill" && op.colour === "tableStripe",
    );
    expect(raw.slice(0, firstStripe).some((op) => op.kind === "line")).toBe(
      true,
    );
    const ordered = Layout.drawOrder(raw);
    const kinds = ordered.map((op) => op.kind);
    expect(kinds.lastIndexOf("fill")).toBeLessThan(kinds.indexOf("line"));
    expect(kinds.lastIndexOf("line")).toBeLessThan(kinds.indexOf("text"));
    expect(ordered).toHaveLength(raw.length);
  });

  const filler = (lines: number) => ({
    kind: "paragraph" as const,
    text: Array.from({ length: lines }, (_, i) => `f${i}`).join("\n"),
  });

  test("a heading stays with the first three signature roles", () => {
    const pages = Layout.paginate(
      [
        filler(30),
        { kind: "heading", level: 2, text: "Signatures" },
        { kind: "signatures", roles: ["A", "B", "C"] },
      ],
      metrics,
      A4,
    );
    expect(pages).toHaveLength(2);
    expect(texts(pages[1] as Page).slice(0, 2)).toEqual(["Signatures", "A"]);
  });

  test("a heading stays with a table's header and first row", () => {
    const tall = Array.from({ length: 5 }, (_, i) => `l${i}`).join("\n");
    const pages = Layout.paginate(
      [
        filler(49),
        { kind: "heading", level: 3, text: "Checks" },
        { kind: "table", columns: [{ header: "H", width: 1 }], rows: [[tall]] },
      ],
      metrics,
      A4,
    );
    expect(pages).toHaveLength(2);
    expect(texts(pages[1] as Page).slice(0, 3)).toEqual(["Checks", "H", "l0"]);
  });

  test("a heading stays with a list's first item", () => {
    const long = Array.from({ length: 6 }, (_, i) => `item${i}`).join("\n");
    const pages = Layout.paginate(
      [
        filler(51),
        { kind: "heading", level: 3, text: "Not run" },
        { kind: "list", items: [long] },
      ],
      metrics,
      A4,
    );
    expect(texts(pages.at(-1) as Page)[0]).toBe("Not run");
  });
});

describe("Layout.cover", () => {
  const fields: Field[] = [
    { label: "Document ID", value: "DOC-1" },
    { label: "Verdict", value: "Passed" },
  ];

  test("logo and brand at the top, title at 40%, rule, subtitle, rows at the bottom", () => {
    const ops = Layout.cover(
      { brandName: "brand", title: "Title", subtitle: "Sub", fields },
      { width: 40, height: 40 },
      metrics,
      A4,
    );
    const image = ops.find((op) => op.kind === "image");
    expect(image).toMatchObject({
      x: A4.margin,
      y: A4.height - A4.margin - 40,
      height: 40,
    });
    const brand = textOps(ops).find((op) => op.text === "brand");
    expect(brand).toMatchObject({
      x: A4.margin + 50,
      font: "heading",
      colour: "muted",
    });
    const title = textOps(ops).find((op) => op.text === "Title");
    expect(title).toMatchObject({ size: 30, font: "heading", colour: "title" });
    expect(A4.height * 0.6 - (title?.y as number)).toBeCloseTo(30 * 0.78, 5);
    const accent = ops.find(
      (op) => op.kind === "line" && op.colour === "accent",
    );
    expect(accent).toMatchObject({ thickness: 1.5 });
    if (accent?.kind === "line")
      expect(accent.x2 - accent.x1).toBeCloseTo(30 * (72 / 25.4), 5);
    expect(textOps(ops).find((op) => op.text === "Sub")).toMatchObject({
      size: 13,
      colour: "muted",
    });
    const verdict = textOps(ops).find((op) => op.text === "Passed");
    expect(verdict).toMatchObject({ y: A4.margin, colour: "muted" });
    expect(textOps(ops).find((op) => op.text === "Verdict")).toMatchObject({
      font: "bodyBold",
    });
    expect(
      ops.find((op) => op.kind === "line" && op.colour === "rule"),
    ).toBeDefined();
  });

  test("no logo and no brand name", () => {
    const ops = Layout.cover(
      { brandName: null, title: "T", subtitle: "", fields },
      null,
      metrics,
      A4,
    );
    expect(ops.some((op) => op.kind === "image")).toBe(false);
    expect(texts(ops)).toEqual([
      "Document ID",
      "DOC-1",
      "Verdict",
      "Passed",
      "T",
    ]);
  });

  test("a long title moves up and shrinks instead of running into the rows", () => {
    const title = Array.from({ length: 110 }, () => "word").join(" ");
    const many = Array.from({ length: 8 }, (_, i) => ({
      label: `L${i}`,
      value: "v",
    }));
    const ops = Layout.cover(
      { brandName: "brand", title, subtitle: "sub", fields: many },
      { width: 40, height: 40 },
      metrics,
      A4,
    );
    const rule = ops.find((op) => op.kind === "line" && op.colour === "rule");
    const lowest = Math.min(
      ...textOps(ops)
        .filter((op) => op.text === "sub" || op.font === "heading")
        .map((op) => op.y),
    );
    expect(lowest).toBeGreaterThan((rule as { y1: number }).y1);
    expect(
      textOps(ops).find((op) => op.text.startsWith("word"))?.size,
    ).toBeLessThan(30);
  });
});

describe("Layout.chrome", () => {
  test("header left, classification right, footer right-aligned, all fitted", () => {
    const ops = Layout.chrome(
      "Header",
      "Internal",
      "Footer 2 of 3",
      metrics,
      A4,
    );
    const right = A4.width - A4.margin;
    expect(textOps(ops).find((op) => op.text === "Header")).toMatchObject({
      x: A4.margin,
      size: 8.5,
      colour: "muted",
    });
    const internal = textOps(ops).find((op) => op.text === "Internal");
    expect((internal?.x as number) + 8 * 8.5 * 0.5).toBeCloseTo(right, 5);
    expect(ops.filter((op) => op.kind === "line")).toHaveLength(2);
    const long = Layout.chrome("x".repeat(400), "Internal", "", metrics, A4);
    const header = textOps(long).find((op) => op.text.startsWith("x"));
    expect(header?.text.endsWith("…")).toBe(true);
    expect(
      Layout.chrome("", "", "", metrics, A4).filter((op) => op.kind === "text"),
    ).toHaveLength(0);
  });
});
