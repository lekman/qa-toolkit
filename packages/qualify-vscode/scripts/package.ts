/**
 * Packages the built extension as a .vsix in this folder, with vsce. The
 * bundle holds every dependency, so vsce does not read node_modules. The
 * repository's LICENSE is copied in first, because the .vsix carries it.
 * Nothing is published.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const { name, version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as { name: string; version: string };

copyFileSync(join(root, "../../LICENSE"), join(root, "LICENSE"));

const out = `${name}-${version}.vsix`;
const vsce = spawnSync(
  "bunx",
  ["--bun", "vsce", "package", "--no-dependencies", "--out", out],
  { cwd: root, stdio: "inherit" },
);
if (vsce.status !== 0) process.exit(vsce.status ?? 1);
console.log(`packaged ${join(root, out)}`);
