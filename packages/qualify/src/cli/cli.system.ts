import { readdir, readFile } from "node:fs/promises";

import type { ICliIO } from "./interfaces";

import { SystemDependencies } from "../execution";

/** The CLI's view of the real process and file system. */
export class SystemCliIO {
  /** Build the I/O for the running process. */
  static create(): ICliIO {
    return {
      ...SystemDependencies.create(),
      list: async (dir) => {
        try {
          return await readdir(dir);
        } catch (error) {
          if ((error as { code?: unknown }).code === "ENOENT") return undefined;
          throw error;
        }
      },
      readBytes: async (path) => new Uint8Array(await readFile(path)),
      stderr: (text) => {
        process.stderr.write(text);
      },
      stdout: (text) => {
        process.stdout.write(text);
      },
    };
  }
}
