import { CommandLines } from "@lekman/test-sets";
import { dirname, join, relative } from "node:path";

import type { ITraceHost } from "./interfaces";
import type { CliFacts, EvidenceRun } from "./types";

/** The npm package of the qualify CLI. */
const PACKAGE = "@lekman/qualify";
/** A version without a range: `0.2.0`, `1.0.0-rc.1`. */
const EXACT = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * Picks how to run the qualify CLI the workspace uses: its own install,
 * else `bunx` or `npx` at the version the workspace pins.
 */
export class QualifyCli {
  /** The command that starts the CLI. */
  static command(facts: CliFacts, platform: string): string {
    if (facts.bin !== undefined) return CommandLines.quote(facts.bin, platform);
    const spec =
      facts.version === undefined ? PACKAGE : `${PACKAGE}@${facts.version}`;
    return facts.bun ? `bunx ${spec}` : `npx --yes ${spec}`;
  }

  /** Looks for the CLI, a Bun lockfile and a pinned version from the run's folder up to its workspace folder. */
  static async facts(host: ITraceHost, run: EvidenceRun): Promise<CliFacts> {
    const facts: CliFacts = { bun: false };
    const bin = host.platform === "win32" ? "qualify.cmd" : "qualify";
    for (const dir of QualifyCli.upwards(run.dir, run.folder.path)) {
      const installed = join(dir, "node_modules", ".bin", bin);
      if (facts.bin === undefined && (await host.exists(installed)))
        facts.bin = installed;
      if (
        !facts.bun &&
        ((await host.exists(join(dir, "bun.lock"))) ||
          (await host.exists(join(dir, "bun.lockb"))))
      ) {
        facts.bun = true;
      }
      if (facts.version === undefined) {
        const text = await host.read(join(dir, "package.json"));
        const pinned = text === undefined ? undefined : QualifyCli.pinned(text);
        if (pinned !== undefined) facts.version = pinned;
      }
    }
    if (
      facts.version === undefined &&
      run.toolVersion !== undefined &&
      EXACT.test(run.toolVersion)
    ) {
      facts.version = run.toolVersion;
    }
    return facts;
  }

  /** `qualify merge` of an evidence folder into a run file. */
  static merge(
    cli: string,
    evidenceDir: string,
    out: string,
    platform: string,
  ): string {
    const q = (v: string): string => CommandLines.quote(v, platform);
    return `${cli} merge --evidence-dir ${q(evidenceDir)} --out ${q(out)}`;
  }

  /** The exact version of `@lekman/qualify` a `package.json` depends on, if it pins one. */
  static pinned(text: string): string | undefined {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return undefined;
    }
    const d = data as Record<string, Record<string, unknown> | undefined>;
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      const value = d?.[field]?.[PACKAGE];
      if (typeof value !== "string") continue;
      const version = value.trim().replace(/^[=v^~]+/, "");
      if (EXACT.test(version)) return version;
    }
    return undefined;
  }

  /** `qualify trace` of a run file into a Markdown trace matrix. */
  static trace(
    cli: string,
    runFile: string,
    out: string,
    platform: string,
  ): string {
    const q = (v: string): string => CommandLines.quote(v, platform);
    return `${cli} trace ${q(runFile)} --md ${q(out)}`;
  }

  /** The folders from `from` up to `folder`, nearest first. */
  private static upwards(from: string, folder: string): string[] {
    const dirs: string[] = [];
    let dir = from;
    for (;;) {
      dirs.push(dir);
      const rel = relative(folder, dir);
      const parent = dirname(dir);
      if (rel.length === 0 || rel.startsWith("..") || parent === dir)
        return dirs;
      dir = parent;
    }
  }
}
