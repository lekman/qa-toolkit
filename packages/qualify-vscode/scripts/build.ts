/**
 * Bundles the extension into one CommonJS file, dist/extension.js, for the
 * VS Code extension host. `vscode` is provided by the host, so it stays
 * external; everything else, including the runner definitions in runners/,
 * is bundled.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outdir = join(root, "dist");

await rm(outdir, { force: true, recursive: true });

const result = await Bun.build({
  entrypoints: [join(root, "src/extension/extension.system.ts")],
  external: ["vscode"],
  format: "cjs",
  naming: "extension.js",
  outdir,
  target: "node",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`built ${join(outdir, "extension.js")}`);
