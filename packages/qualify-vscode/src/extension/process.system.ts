import { spawn } from "node:child_process";

import type { IProcessRunner } from "../runs";

/** How long the output may stay open after the command exits, for the last of it to arrive. */
const DRAIN_MS = 2000;

/**
 * Runs a command in the user's shell and streams its output. The command
 * ends when its shell exits: a process it started and left running, such as
 * a preview server, would keep the output open and the run with it, so that
 * process group is stopped once the output has had time to drain.
 */
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
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stopped = false;
      let settled = false;
      let drain: NodeJS.Timeout | undefined;
      const killGroup = (): void => {
        if (child.pid === undefined) return;
        try {
          if (windows) child.kill();
          else process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill();
        }
      };
      const stop = (): void => {
        stopped = true;
        killGroup();
      };
      const finish = (code: null | number): void => {
        if (settled) return;
        settled = true;
        clearTimeout(drain);
        options.signal.removeEventListener("abort", stop);
        resolve(stopped ? null : code);
      };
      options.signal.addEventListener("abort", stop, { once: true });
      child.stdout.on("data", (b: Buffer) => options.onOutput(b.toString()));
      child.stderr.on("data", (b: Buffer) => options.onOutput(b.toString()));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      child.on("exit", (code) => {
        drain = setTimeout(() => {
          options.onOutput(
            "\nThe command exited, but a process it started still held its output open; that process was stopped.\n",
          );
          killGroup();
          child.stdout.destroy();
          child.stderr.destroy();
          finish(code);
        }, DRAIN_MS);
      });
      child.on("close", (code) => finish(code));
    });
  }
}
