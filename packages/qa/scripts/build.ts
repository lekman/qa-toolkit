/**
 * Builds the qa CLI into one file for Node, with @lekman/test-sets and its
 * dependencies bundled from source.
 */

import { chmodSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outdir = join(root, "dist");

await rm(outdir, { force: true, recursive: true });

const result = await Bun.build({
  conditions: ["bun"],
  entrypoints: [join(root, "src/cli/cli.ts")],
  format: "esm",
  naming: "cli.js",
  outdir,
  packages: "bundle",
  target: "node",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
chmodSync(join(outdir, "cli.js"), 0o755);
console.log("built dist/cli.js");
