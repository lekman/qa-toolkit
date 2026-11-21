import type { GitFacts } from "./types";

/** Reads git facts. Implemented by the system layer. */
export interface IGitProbe {
  /** Facts for the repository holding `cwd`, with `null` for anything unknown. */
  read(cwd: string): GitFacts;
}
