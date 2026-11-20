import fontkit from "@pdf-lib/fontkit";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SubsetFix } from "../../src/report/subset-fix";

const FONT = new Uint8Array(
  readFileSync(join(import.meta.dir, "../../fonts/NotoSans-Regular.ttf")),
);
const TEXT = "Conformance report: fixture not seeded";

interface Glyph {
  id: number;
  path: { toSVG(): string };
}
interface Font {
  createSubset(): {
    encodeStream(): NodeJS.ReadableStream;
    glyphs: number[];
    includeGlyph(g: Glyph): number;
  };
  getGlyph(id: number): Glyph;
  layout(text: string): { glyphs: Glyph[] };
}

/** Subset the text's glyphs, then compare every outline with the original font. */
const differing = async (kit: typeof fontkit): Promise<number> => {
  const font = kit.create(FONT) as unknown as Font;
  const subset = font.createSubset();
  for (const glyph of font.layout(TEXT).glyphs) subset.includeGlyph(glyph);
  const parts: Uint8Array[] = [];
  await new Promise<void>((resolve) => {
    subset
      .encodeStream()
      .on("data", (b: Uint8Array) => parts.push(new Uint8Array(b)))
      .on("end", () => resolve());
  });
  const parsed = fontkit.create(Buffer.concat(parts)) as unknown as Font;
  return subset.glyphs.filter((gid, i) => {
    try {
      return (
        parsed.getGlyph(i).path.toSVG() !== font.getGlyph(gid).path.toSVG()
      );
    } catch {
      // A glyph read from the wrong offset can fail to parse at all.
      return true;
    }
  }).length;
};

describe("SubsetFix", () => {
  test("every subset glyph keeps its outline", async () => {
    expect(await differing(SubsetFix.fontkit())).toBe(0);
  });

  test("@pdf-lib/fontkit alone still loses outlines; drop the fix when this fails", async () => {
    expect(await differing(fontkit)).toBeGreaterThan(0);
  });

  test("a subset without the expected shape is left alone", () => {
    const subset = { offset: 0 } as never;
    expect(SubsetFix.pad(subset)).toBe(subset);
  });
});
