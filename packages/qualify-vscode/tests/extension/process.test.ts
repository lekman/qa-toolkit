import { describe, expect, test } from "bun:test";

import { ShellProcess } from "../../src/extension/process.system";

const run = (command: string, signal = new AbortController().signal) => {
  let output = "";
  const done = new ShellProcess().run(command, {
    cwd: process.cwd(),
    env: { QV_TEST: "set" },
    onOutput: (t) => {
      output += t;
    },
    signal,
  });
  return done.then((code) => ({ code, output }));
};

describe.skipIf(process.platform === "win32")("ShellProcess", () => {
  test("returns the exit code and the output", async () => {
    const { code, output } = await run('echo "$QV_TEST"; exit 3');
    expect(code).toBe(3);
    expect(output).toContain("set");
  });

  test("ends when the shell exits, though a process it left running holds the output open", async () => {
    const started = Date.now();
    const { code, output } = await run("sleep 30 & echo started");
    expect(code).toBe(0);
    expect(output).toContain("started");
    expect(output).toContain("still held its output open");
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("returns null when the run is stopped", async () => {
    const abort = new AbortController();
    const done = run("sleep 30", abort.signal);
    setTimeout(() => abort.abort(), 200);
    expect((await done).code).toBeNull();
  });
});
