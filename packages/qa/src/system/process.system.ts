import { spawn, spawnSync } from "node:child_process";

import type { IProcess } from "../run";

/** Runs commands in the shell, with the terminal's output. */
export class ShellProcess implements IProcess {
  /** The lines a git command prints, or none when it fails. */
  static git(args: readonly string[], cwd: string): string[] | undefined {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    return r.status === 0
      ? r.stdout.split("\n").filter((l) => l.length > 0)
      : undefined;
  }

  /** Runs a command and resolves with its exit code. */
  run(
    command: string,
    options: { cwd: string; env: Readonly<Record<string, string>> },
  ): Promise<null | number> {
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: true,
        stdio: "inherit",
      });
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    });
  }
}
