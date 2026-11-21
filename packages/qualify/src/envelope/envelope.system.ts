import { execFileSync } from "node:child_process";

import type { IGitProbe } from "./interfaces";
import type { GitFacts } from "./types";

const git = (cwd: string, args: string[]): null | string => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

/** Runs `git` to read the commit, branch and state of the working tree. */
export class GitProbe implements IGitProbe {
  /** Every value is `null` when git is missing or `cwd` is not a repository. */
  read(cwd: string): GitFacts {
    const root = git(cwd, ["rev-parse", "--show-toplevel"]);
    if (root === null) {
      return { root: null, commit: null, branch: null, dirty: null };
    }
    const status = git(cwd, ["status", "--porcelain", "--untracked-files=no"]);
    return {
      root,
      commit: git(cwd, ["rev-parse", "HEAD"]),
      branch: git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
      dirty: status === null ? null : status.length > 0,
    };
  }
}
