import { randomBytes } from "node:crypto";

import type { QualifyOptions } from "../settings";
import type { IRuntimeDependencies } from "./interfaces";

import { GitProbe } from "../envelope";
import { AtomicFileWriter } from "../evidence";
import { Runtime } from "./runtime";

/** The process's real environment, clock, git and file system. */
export class SystemDependencies {
  /** Dependencies backed by the running process. */
  static create(): IRuntimeDependencies {
    const bun = (process.versions as Record<string, string | undefined>).bun;
    return {
      cwd: () => process.cwd(),
      env: process.env,
      git: new GitProbe(),
      now: () => new Date(),
      random: (size) => new Uint8Array(randomBytes(size)),
      runtime: () =>
        bun === undefined ? `node ${process.versions.node}` : `bun ${bun}`,
      warn: (message) => {
        process.stderr.write(`${message}\n`);
      },
      writer: new AtomicFileWriter(),
    };
  }
}

/** The process's shared runtime, for `configure`. */
const shared = (): Runtime => new Runtime(SystemDependencies.create());

/**
 * Give settings in code, for example from a setup file. Environment variables
 * still win. Every adapter in the process sees them.
 */
export const configure = (options: QualifyOptions): void => {
  shared().configure(options);
};
