import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Finds the package's `themes/` folder. */
export class BundledThemes {
  /**
   * The `themes/` folder above this module, which sits in `src/theme/` when
   * run from source and in `dist/` or `dist/chunks/` when built.
   */
  static dir(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 4; i++) {
      const candidate = join(dir, "themes");
      if (existsSync(join(candidate, "lekman", "theme.json"))) return candidate;
      dir = dirname(dir);
    }
    throw new Error("qualify: the bundled themes in themes/ were not found");
  }
}
