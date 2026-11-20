/** What git reports about the working directory. `null` when unknown. */
export interface GitFacts {
  /** Current branch, or `null` on a detached head or without git. */
  branch: null | string;
  commit: null | string;
  /** Whether tracked files have changes. Untracked files do not count. */
  dirty: boolean | null;
  /** The repository's top folder, or `null` outside a repository. */
  root: null | string;
}
