#!/usr/bin/env node
/**
 * The `qa` command: reads qa.yaml, plans the sets, runs them and prints the
 * results. Wiring only; the logic is in the args, plan, run and report
 * modules.
 */

import { RunIds, TestSets } from "@lekman/test-sets";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { Args } from "../args";
import { QaPlan } from "../plan";
import { ConsoleReport } from "../report";
import { QaRun } from "../run";
import { NodeFiles, ShellProcess } from "../system";

const VERSION = "0.1.0";
const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const fail = (code: number, message: string): never => {
  process.stderr.write(`qa: ${message}\n`);
  process.exit(code);
};

/** The qa.yaml to read: the one given, or the nearest at or above the working directory. */
const configPath = (given: string | undefined): string => {
  if (given !== undefined) return resolve(given);
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, TestSets.FILE);
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir)
        return fail(2, `no ${TestSets.FILE} here or in a folder above`);
      dir = parent;
    }
  }
};

const parsed = Args.parse(process.argv.slice(2));
if (parsed.kind === "help") {
  log(Args.USAGE);
  process.exit(0);
}
if (parsed.kind === "version") {
  log(VERSION);
  process.exit(0);
}
if (parsed.kind === "usage") fail(64, `${parsed.error}\n\n${Args.USAGE}`);
if (parsed.kind !== "list" && parsed.kind !== "run") process.exit(64);

const path = configPath(parsed.config);
const root = dirname(path);
let text = "";
try {
  text = readFileSync(path, "utf8");
} catch {
  fail(2, `cannot read ${path}`);
}
const { file, problems } = TestSets.parse(text);
if (file === undefined)
  fail(2, `${path} is invalid:\n  ${problems.join("\n  ")}`);
const config = file as NonNullable<typeof file>;
const folders = await NodeFiles.folders(root, 4);

if (parsed.kind === "list") {
  if (parsed.json) {
    log(
      JSON.stringify(
        config.sets.map((s) => ({ ...s, folders: QaPlan.folders(s, folders) })),
        null,
        2,
      ),
    );
  } else {
    for (const line of ConsoleReport.list(config, folders)) log(line);
  }
  process.exit(0);
}

// Paths relative to the folder of qa.yaml, which may sit below the git root.
let changed: string[] | undefined;
if (parsed.changed) {
  const base = parsed.base ?? "origin/main";
  const committed = ShellProcess.git(
    ["diff", "--name-only", "--relative", `${base}...HEAD`],
    root,
  );
  if (committed === undefined)
    fail(2, `cannot compare with ${base}; give --base REF`);
  changed = [
    ...new Set([
      ...(committed ?? []),
      ...(ShellProcess.git(
        ["diff", "--name-only", "--relative", "HEAD"],
        root,
      ) ?? []),
      ...(ShellProcess.git(
        ["ls-files", "--others", "--exclude-standard"],
        root,
      ) ?? []),
    ]),
  ];
}

const out = isAbsolute(parsed.out) ? parsed.out : join(root, parsed.out);
const runId = RunIds.create(Date.now(), randomBytes(16));
const dirs = folders.flatMap((f) => {
  const chain: string[] = [];
  let dir = f === "." ? root : join(root, f);
  while (dir.startsWith(root)) {
    chain.push(dir);
    if (dir === root) break;
    dir = dirname(dir);
  }
  return chain;
});
const plan = QaPlan.build({
  ...(changed === undefined ? {} : { changed }),
  file: config,
  filter: { levels: parsed.levels, names: parsed.names },
  folders,
  index: await NodeFiles.index(dirs),
  out,
  platform: process.platform,
  root,
  runId,
});
for (const problem of plan.problems) process.stderr.write(`qa: ${problem}\n`);
if (plan.runs.length === 0) {
  log(
    changed === undefined
      ? "qa: nothing to run"
      : "qa: no set covers a changed folder",
  );
  process.exit(plan.problems.length > 0 ? 2 : 0);
}

const outcome = await QaRun.execute(
  plan.runs,
  {
    dryRun: parsed.dryRun,
    out,
    platform: process.platform,
    qualify: parsed.qualify,
    report: parsed.report,
    root,
  },
  { clock: Date.now, files: new NodeFiles(), log, process: new ShellProcess() },
);
if (!parsed.dryRun) {
  for (const line of ConsoleReport.results(outcome.results)) log(line);
  log(`Results in ${out}`);
}
process.exit(outcome.exitCode);
