import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ReportFonts } from "./types";

/** Reads the bundled Noto Sans files from the package's `fonts/` folder. */
export class BundledFonts {
  /**
   * Find `fonts/` above this module, which sits in `src/report/` when run
   * from source and in `dist/` or `dist/chunks/` when built.
   */
  static async load(): Promise<ReportFonts> {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 4; i++) {
      try {
        const [regular, bold] = await Promise.all([
          readFile(join(dir, "fonts", "NotoSans-Regular.ttf")),
          readFile(join(dir, "fonts", "NotoSans-Bold.ttf")),
        ]);
        return { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
      } catch {
        dir = dirname(dir);
      }
    }
    throw new Error("qualify: the bundled fonts in fonts/ were not found");
  }
}
