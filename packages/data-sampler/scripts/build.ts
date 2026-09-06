/**
 * Build the data-sampler library and CLI with Bun, targeting Node.
 *
 * Two entrypoints: `src/index.ts` (the library) and `src/cli.ts` (the bin).
 * `@faker-js/faker` stays external so this package and the consumer's own
 * tests share one faker instance and one version; bundling it would put a
 * second copy of the module in the tree. Everything else is bundled, as the
 * root `scripts/build.ts` does.
 */

import { chmodSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outdir = join(root, "dist");

await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [join(root, "src/index.ts"), join(root, "src/cli.ts")],
  outdir,
  target: "node",
  format: "esm",
  packages: "bundle",
  external: ["@faker-js/faker"],
  // No banner: Bun carries the entrypoint's own shebang through to the bundle,
  // and adding one produces a second, syntactically invalid line.
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

chmodSync(join(outdir, "cli.js"), 0o755);
console.log("built dist/index.js, dist/cli.js");
