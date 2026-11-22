import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { IThemeFiles, Theme } from "../../src/theme";

import { ThemeLoader } from "../../src/theme";

/** The package's bundled themes, read from disk. */
export const THEMES = resolve(import.meta.dir, "../../themes");
/** The specification's theme folder. */
export const SPEC_THEMES = resolve(
  import.meta.dir,
  "../../../../spec/qualify/report/themes",
);
/** The specification's conformance fixtures. */
export const FIXTURES = resolve(
  import.meta.dir,
  "../../../../spec/qualify/conformance/fixtures",
);

/** Theme files on disk, with optional overrides by path. */
export const diskFiles = (
  overrides: Record<string, string | Uint8Array> = {},
): IThemeFiles => ({
  bundledDir: () => THEMES,
  readBytes: async (path) => {
    const value = overrides[path];
    if (value !== undefined)
      return typeof value === "string"
        ? new Uint8Array(Buffer.from(value))
        : value;
    return new Uint8Array(readFileSync(path));
  },
});

/** Load a bundled theme. */
export const theme = (name: "lekman" | "plain"): Promise<Theme> =>
  ThemeLoader.load(name, "/", diskFiles());

/** A bundled theme file's JSON, for building variants. */
export const themeJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(THEMES, name, "theme.json"), "utf8")) as Record<
    string,
    unknown
  >;
