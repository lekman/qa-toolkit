import type { ResultFormat } from "../runners";
import type { TestRecord } from "./types";

/**
 * Reads one result format. Qualify evidence is the format for qualification
 * tests; a JUnit XML reader for other tests implements the same port.
 */
export interface IResultReader {
  /** Whether a file name can hold results in this format. */
  accepts(path: string): boolean;
  readonly format: ResultFormat;
  /** The test records in a file's text; none when the text is not in this format. */
  read(path: string, text: string): TestRecord[];
}

/** Lists and reads the files a run left in its results folder. */
export interface IResultFiles {
  /**
   * Files under `dir`, down to `depth` folders, changed at or after
   * `sinceMs`; none when `dir` does not exist.
   */
  list(dir: string, depth: number, sinceMs: number): Promise<string[]>;
  /** Creates a folder and its parents, when they do not exist. */
  mkdir(dir: string): Promise<void>;
  read(path: string): Promise<string | undefined>;
}
