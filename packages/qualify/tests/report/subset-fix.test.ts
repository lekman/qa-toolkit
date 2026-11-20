import fontkit from "@pdf-lib/fontkit";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SubsetFix } from "../../src/report/subset-fix";
import { THEMES } from "../mocks/theme.mock";

const TEXT = "Conformance report: fixture not seeded 0123456789 {}[]";

interface Glyph {
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

const FONTS = readdirSync(THEMES).flatMap((theme) =>
  readdirSync(join(THEMES, theme, "fonts"))
    .filter((name) => name.endsWith(".ttf"))
    .map((name) => join(THEMES, theme, "fonts", name)),
);

/** Subset the text's glyphs, then compare every outline with the original font. */
const differing = async (
  kit: typeof fontkit,
  file: string,
): Promise<number> => {
  const font = kit.create(
    new Uint8Array(readFileSync(file)),
  ) as unknown as Font;
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
  test("covers every bundled font", () => {
    expect(FONTS.length).toBe(5);
  });

  test.each(FONTS)(
    "every subset glyph of %s keeps its outline",
    async (file) => {
      expect(await differing(SubsetFix.fontkit(), file)).toBe(0);
    },
  );

  test("@pdf-lib/fontkit alone still loses Noto Sans outlines; drop the fix when this fails", async () => {
    const noto = FONTS.find((f) =>
      f.endsWith("NotoSans-Regular.ttf"),
    ) as string;
    expect(await differing(fontkit, noto)).toBeGreaterThan(0);
  });

  test("a subset without the expected shape is left alone", () => {
    const subset = { offset: 0 } as never;
    expect(SubsetFix.pad(subset)).toBe(subset);
  });
});
