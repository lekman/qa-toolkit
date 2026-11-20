/**
 * Build the qualify library, the three adapters, their setup modules and the
 * CLI with Bun, targeting Node.
 *
 * Every package import stays external: `ajv` and `yaml` are runtime
 * dependencies, and `vitest` is the consumer's own copy, which the adapter
 * must share. `bun:test` exists only under Bun. Everything in `src/` is
 * bundled, including the two schemas. Code shared by several entry points
 * goes into `dist/chunks/`.
 */

import { chmodSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outdir = join(root, "dist");

await rm(outdir, { recursive: true, force: true });

const entries = [
  "src/index.ts",
  "src/cli/cli.ts",
  "src/adapters/vitest.ts",
  "src/adapters/vitest-setup.ts",
  "src/adapters/node.ts",
  "src/adapters/node-setup.ts",
  "src/adapters/bun.ts",
];

const result = await Bun.build({
  entrypoints: entries.map((entry) => join(root, entry)),
  outdir,
  root: join(root, "src"),
  target: "node",
  format: "esm",
  packages: "external",
  external: ["bun:test"],
  // Shared code goes into chunks instead of a copy per entry point.
  splitting: true,
  naming: { entry: "[name].[ext]", chunk: "chunks/[name]-[hash].[ext]" },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

chmodSync(join(outdir, "cli.js"), 0o755);
console.log(
  `built ${result.outputs.map((o) => o.path.slice(outdir.length + 1)).join(", ")}`,
);
