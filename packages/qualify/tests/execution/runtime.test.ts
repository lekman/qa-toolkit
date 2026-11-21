import { describe, expect, test } from "bun:test";

import type { AdapterInfo, IRuntimeDependencies } from "../../src/execution";

import { Runtime } from "../../src/execution";
import { ConfigurationError } from "../../src/settings";
import { GitMock, MemoryWriter, steppingClock } from "../mocks/memory.mock";

const deps = (
  env: Record<string, string> = {},
  root: null | string = "/repo",
): IRuntimeDependencies => ({
  cwd: () => "/work",
  env,
  git: new GitMock({ root, commit: null, branch: null, dirty: null }),
  now: steppingClock(),
  random: (n) => new Uint8Array(n).fill(1),
  runtime: () => "node 22.0.0",
  warn: () => undefined,
  writer: new MemoryWriter(),
});

const adapter = (runId = "01HQA1ZQJ0C0NF0RMANCE00000"): AdapterInfo => ({
  ownRoot: "/pkg/src",
  runner: "test runner",
  runId: () => runId,
});

describe("Runtime", () => {
  test("builds the process context once", () => {
    const runtime = new Runtime(deps({ QUALIFY_EVIDENCE_DIR: "ev" }), {});
    const context = runtime.process(adapter());
    expect(runtime.process(adapter())).toBe(context);
    expect(context.evidenceDir).toBe("/work/ev");
    expect(context.envelope.tool).toEqual({
      name: "@lekman/qualify",
      version: Runtime.TOOL_VERSION,
      language: "typescript",
      runtime: "node 22.0.0; test runner",
    });
    expect(context.sites).toEqual({ root: "/repo", exclude: ["/pkg/src"] });
    expect(context.now().toISOString()).toBe("2026-01-02T03:04:05.000Z");
    context.warn("x");
  });

  test("an absolute evidence directory and a working-directory root", () => {
    const runtime = new Runtime(
      deps({ QUALIFY_EVIDENCE_DIR: "/abs" }, null),
      {},
    );
    expect(runtime.process(adapter()).evidenceDir).toBe("/abs");
    expect(runtime.sites("/own")).toEqual({ root: "/work", exclude: ["/own"] });
  });

  test("configure merges options and drops the cached context", () => {
    const holder = {};
    const runtime = new Runtime(deps(), holder);
    const first = runtime.process(adapter());
    runtime.configure({ environment: "staging" });
    runtime.configure({ attachmentLimit: 10 });
    expect(runtime.options()).toEqual({
      environment: "staging",
      attachmentLimit: 10,
    });
    const second = runtime.process(adapter());
    expect(second).not.toBe(first);
    expect(second.settings.environment).toBe("staging");
    expect(new Runtime(deps(), holder).options().environment).toBe("staging");
    runtime.reset();
    expect(runtime.process(adapter())).not.toBe(second);
  });

  test("a configuration error is kept and thrown for every test", () => {
    const runtime = new Runtime(deps({ QUALIFY_ATTACHMENT_LIMIT: "lots" }), {});
    expect(() => runtime.process(adapter())).toThrow(ConfigurationError);
    expect(() => runtime.process(adapter())).toThrow(ConfigurationError);
    expect(() => runtime.settings()).toThrow(ConfigurationError);
  });

  test("a run ID that is not a ULID is refused", () => {
    expect(() => new Runtime(deps(), {}).process(adapter("nope"))).toThrow(
      "is not a ULID",
    );
  });

  test("creates ULIDs from the clock and randomness", () => {
    expect(new Runtime(deps(), {}).createRunId()).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{26}$/,
    );
  });
});
