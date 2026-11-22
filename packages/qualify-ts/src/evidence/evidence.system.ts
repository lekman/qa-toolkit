import { randomBytes } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { IEvidenceWriter } from "./interfaces";

/** Writes files atomically on the local file system. */
export class AtomicFileWriter implements IEvidenceWriter {
  /** Write to a hidden temporary file, flush it, then rename it into place. */
  async write(path: string, content: string | Uint8Array): Promise<void> {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    const temporary = join(
      dir,
      `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
    );
    const handle = await open(temporary, "w");
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}
