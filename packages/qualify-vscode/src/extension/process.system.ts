import { spawn } from "node:child_process";

import type { IProcessRunner } from "../runs";

/** Runs a command in the user's shell and streams its output. */
export class ShellProcess implements IProcessRunner {
  /** Runs the command and resolves with its exit code, or `null` when it was stopped. */
  run(
    command: string,
    options: {
      cwd: string;
      env: Readonly<Record<string, string>>;
      onOutput: (text: string) => void;
      signal: AbortSignal;
    },
  ): Promise<null | number> {
    return new Promise((resolve, reject) => {
      const windows = process.platform === "win32";
      const child = spawn(command, {
        cwd: options.cwd,
        detached: !windows,
        env: { ...process.env, ...options.env, FORCE_COLOR: "0" },
        shell: true,
      });
      let stopped = false;
      const stop = (): void => {
        stopped = true;
        if (child.pid === undefined) return;
        try {
          if (windows) child.kill();
          else process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill();
        }
      };
      options.signal.addEventListener("abort", stop, { once: true });
      child.stdout.on("data", (b: Buffer) => options.onOutput(b.toString()));
      child.stderr.on("data", (b: Buffer) => options.onOutput(b.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        options.signal.removeEventListener("abort", stop);
        resolve(stopped ? null : code);
      });
    });
  }
}
