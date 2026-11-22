/**
 * Bundles the extension host test suite into dist-test/suite.js, a CommonJS
 * module that @vscode/test-electron loads inside VS Code.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outdir = join(root, "dist-test");

await rm(outdir, { force: true, recursive: true });

const result = await Bun.build({
  conditions: ["bun"],
  entrypoints: [join(root, "test-host/suite.ts")],
  external: ["vscode"],
  format: "cjs",
  naming: "suite.js",
  outdir,
  target: "node",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
