import type { WriteStream } from "node:fs";

import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { IOutputSink } from "./interfaces";

/** Writes to the process's standard output. */
export class StdoutSink implements IOutputSink {
  /** Nothing to close; stdout outlives the sink. */
  async close(): Promise<void> {
    // Intentionally empty.
  }

  /** Resolves once the chunk has been handed to the stream. */
  write(chunk: string): Promise<void> {
    return new Promise((resolve, reject) => {
      process.stdout.write(chunk, (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
}

/** Writes to a file, creating the parent directory first. */
export class FileSink implements IOutputSink {
  private readonly stream: WriteStream;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.stream = createWriteStream(path);
  }

  /** Ends the stream and resolves once it has flushed. */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.once("error", reject);
      this.stream.end(() => resolve());
    });
  }

  /** Resolves once the chunk has been handed to the stream. */
  write(chunk: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.write(chunk, (error) => (error ? reject(error) : resolve()));
    });
  }
}
