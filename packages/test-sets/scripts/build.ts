/**
 * Builds the library with Bun, targeting Node. `yaml`, `ajv` and the schema
 * are bundled, so the published package has no runtime dependencies.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outdir = join(root, "dist");

await rm(outdir, { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [join(root, "src/index.ts")],
  format: "esm",
  outdir,
  packages: "bundle",
  target: "node",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("built dist/index.js");
