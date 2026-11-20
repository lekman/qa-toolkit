import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ThemeError, ThemeLoader } from "../../src/theme";
import {
  diskFiles,
  FIXTURES,
  SPEC_THEMES,
  themeJson,
  THEMES,
} from "../mocks/theme.mock";

const filesBelow = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });

describe("bundled themes", () => {
  test("match spec/qualify/report/themes byte for byte, with no file more or less", () => {
    const spec = filesBelow(SPEC_THEMES)
      .map((p) => relative(SPEC_THEMES, p))
      .sort();
    const bundled = filesBelow(THEMES)
      .map((p) => relative(THEMES, p))
      .sort();
    expect(bundled).toEqual(spec);
    for (const file of spec) {
      expect(
        Buffer.compare(
          readFileSync(join(THEMES, file)),
          readFileSync(join(SPEC_THEMES, file)),
        ),
      ).toBe(0);
    }
  });
});

describe("ThemeLoader", () => {
  test("loads a bundled theme by name, sharing bytes between slots that name one file", async () => {
    const lekman = await ThemeLoader.load("lekman", "/", diskFiles());
    expect(lekman.spec.name).toBe("lekman");
    expect(lekman.logo?.format).toBe("png");
    expect(lekman.fonts.heading).toBe(lekman.fonts.bodyBold);
    const plain = await ThemeLoader.load("plain", "/", diskFiles());
    expect(plain.logo).toBeNull();
    expect(plain.fonts.mono).toBe(plain.fonts.body);
  });

  test("loads a theme by path, relative to the working directory, with files relative to it", async () => {
    const path = join(THEMES, "plain", "theme.json");
    const loaded = await ThemeLoader.load(
      relative("/", path),
      "/",
      diskFiles(),
    );
    expect(loaded.spec.name).toBe("plain");
  });

  test("an unknown token is a ThemeError naming it", async () => {
    await expect(
      ThemeLoader.load(
        join(FIXTURES, "bad-theme", "theme.json"),
        "/",
        diskFiles(),
      ),
    ).rejects.toThrow(/texts\.footer uses \{nope\}/);
  });

  const variant = (change: (theme: Record<string, unknown>) => void) => {
    const theme = themeJson("plain");
    change(theme);
    const path = join(THEMES, "plain", "variant.json");
    return { path, files: diskFiles({ [path]: JSON.stringify(theme) }) };
  };

  test.each([
    [
      "a schema violation",
      (t: Record<string, unknown>) =>
        ((t.page as Record<string, unknown>).size = "A3"),
      /must be equal to one of/,
    ],
    [
      "a missing font",
      (t: Record<string, unknown>) =>
        ((t.fonts as Record<string, unknown>).body = "fonts/none.ttf"),
      /fonts\.body .* cannot be read/,
    ],
    [
      "a missing logo",
      (t: Record<string, unknown>) =>
        ((t.brand as Record<string, unknown>).logo = "nope.png"),
      /brand\.logo .* cannot be read/,
    ],
    [
      "a logo that is not an image",
      (t: Record<string, unknown>) =>
        ((t.brand as Record<string, unknown>).logo = "fonts/OFL.txt.png"),
      /brand\.logo/,
    ],
  ])("%s is a ThemeError", async (_, change, message) => {
    const { path, files } = variant(change);
    await expect(ThemeLoader.load(path, "/", files)).rejects.toThrow(message);
  });

  test("a logo with the wrong bytes, a font that is not a font, a variable font, and bad JSON", async () => {
    const dir = join(THEMES, "plain");
    const withLogo = variant(
      (t) => ((t.brand as Record<string, unknown>).logo = "logo.png"),
    );
    const logoFiles = diskFiles({
      [withLogo.path]: JSON.stringify({
        ...themeJson("plain"),
        brand: { logo: "logo.png", logoHeightMm: 14, name: null },
      }),
      [join(dir, "logo.png")]: "not a png",
    });
    await expect(
      ThemeLoader.load(withLogo.path, "/", logoFiles),
    ).rejects.toThrow("is not a PNG or JPEG image");

    const font = join(dir, "fonts", "NotoSans-Regular.ttf");
    await expect(
      ThemeLoader.load(
        join(dir, "theme.json"),
        "/",
        diskFiles({ [font]: "hello" }),
      ),
    ).rejects.toThrow("is not a TrueType or OpenType font");
    const variable = new Uint8Array(readFileSync(font));
    variable.set(Buffer.from("fvar"), 12);
    await expect(
      ThemeLoader.load(
        join(dir, "theme.json"),
        "/",
        diskFiles({ [font]: variable }),
      ),
    ).rejects.toThrow("is a variable font");
    const json = join(dir, "broken.json");
    await expect(
      ThemeLoader.load(json, "/", diskFiles({ [json]: "{" })),
    ).rejects.toThrow(ThemeError);
    await expect(
      ThemeLoader.load("/nowhere/theme.json", "/", diskFiles()),
    ).rejects.toThrow("cannot be read");
  });

  test("a JPEG logo", async () => {
    const dir = join(THEMES, "plain");
    const path = join(dir, "jpeg.json");
    const files = diskFiles({
      [path]: JSON.stringify({
        ...themeJson("plain"),
        brand: { logo: "logo.jpg", logoHeightMm: 14, name: "Acme" },
      }),
      [join(dir, "logo.jpg")]: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    expect((await ThemeLoader.load(path, "/", files)).logo?.format).toBe(
      "jpeg",
    );
  });
});
