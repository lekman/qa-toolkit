import { dirname, isAbsolute, join, resolve } from "node:path";

import type { IThemeFiles } from "./interfaces";
import type { FontSlot, Theme, ThemeFile } from "./types";

import { Schema } from "../schema";
import { ThemeError } from "./errors";
import { Template } from "./template";

const BUNDLED = ["lekman", "plain"] as const;
const SLOTS: readonly FontSlot[] = ["body", "bodyBold", "heading", "mono"];

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((byte, i) => bytes[i] === byte);

/** Whether a font file is a TrueType or OpenType font, and not a variable one. */
const fontProblem = (bytes: Uint8Array): string | undefined => {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  if (!startsWith(bytes, [0, 1, 0, 0]) && tag !== "true" && tag !== "OTTO") {
    return "is not a TrueType or OpenType font";
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = view.getUint16(4);
  for (let i = 0; i < tables; i++) {
    const at = 12 + 16 * i;
    if (String.fromCharCode(...bytes.slice(at, at + 4)) === "fvar") {
      return "is a variable font, which is not supported";
    }
  }
  return undefined;
};

/** Loads a report theme by bundled name or by path, section 9.3. */
export class ThemeLoader {
  /** The bundled theme names. */
  static readonly BUNDLED = BUNDLED;
  /** The default theme. */
  static readonly DEFAULT = "lekman";

  /**
   * Load and check a theme: the schema, the tokens in its texts, and every
   * file it names. Any problem throws `ThemeError`.
   */
  static async load(
    reference: string,
    cwd: string,
    files: IThemeFiles,
  ): Promise<Theme> {
    const path = (BUNDLED as readonly string[]).includes(reference)
      ? join(files.bundledDir(), reference, "theme.json")
      : isAbsolute(reference)
        ? reference
        : resolve(cwd, reference);
    const read = async (file: string, what: string): Promise<Uint8Array> => {
      try {
        return await files.readBytes(file);
      } catch (error) {
        throw new ThemeError(
          `${path}: ${what} ${file} cannot be read (${(error as Error).message})`,
        );
      }
    };
    let data: unknown;
    try {
      data = JSON.parse(
        Buffer.from(await read(path, "the theme file")).toString("utf8"),
      );
    } catch (error) {
      if (error instanceof ThemeError) throw error;
      throw new ThemeError(
        `${path}: not valid JSON (${(error as Error).message})`,
      );
    }
    const problems = Schema.theme(data);
    if (problems.length > 0)
      throw new ThemeError(`${path}: ${problems.join("; ")}`);
    const spec = data as ThemeFile;
    Template.validate({ ...spec.texts }, path);

    const dir = dirname(path);
    const loaded = new Map<string, Uint8Array>();
    const fonts = {} as Record<FontSlot, Uint8Array>;
    for (const slot of SLOTS) {
      const file = resolve(dir, spec.fonts[slot]);
      let bytes = loaded.get(file);
      if (bytes === undefined) {
        bytes = await read(file, `fonts.${slot}`);
        const problem = fontProblem(bytes);
        if (problem !== undefined)
          throw new ThemeError(`${path}: fonts.${slot} ${file} ${problem}`);
        loaded.set(file, bytes);
      }
      fonts[slot] = bytes;
    }

    let logo: Theme["logo"] = null;
    if (spec.brand.logo !== null) {
      const file = resolve(dir, spec.brand.logo);
      const bytes = await read(file, "brand.logo");
      if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]))
        logo = { bytes, format: "png" };
      else if (startsWith(bytes, [0xff, 0xd8, 0xff]))
        logo = { bytes, format: "jpeg" };
      else
        throw new ThemeError(
          `${path}: brand.logo ${file} is not a PNG or JPEG image`,
        );
    }
    return { spec, fonts, logo };
  }
}
