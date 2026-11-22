import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { QualifyContext } from "../../src/checks";
import type { RecordFile, StartedFile } from "../../src/evidence";
import type {
  ProcessContext,
  Registration,
  RunResult,
} from "../../src/execution";
import type { RunnerErrors } from "../../src/outcome";
import type { QualifyOptions } from "../../src/settings";

import { CheckFailed, SecretRegistry } from "../../src/checks";
import { DeclarationError } from "../../src/declaration";
import { Envelope } from "../../src/envelope";
import { Execution } from "../../src/execution";
import { Schema } from "../../src/schema";
import { Policy, SettingsResolver } from "../../src/settings";
import { Site } from "../../src/site";
import { MemoryWriter, steppingClock } from "../mocks/memory.mock";

const RUN = "01HQA1ZQJ0C0NF0RMANCE00000";
const OWN = Site.ownRoot(
  pathToFileURL(join(import.meta.dir, "../../src/index.ts")).href,
);
const SITES = { root: join(import.meta.dir, "../.."), exclude: [OWN] };
const narrative = { given: "g", when: "w", then: "t", scope: "read" as const };

const RUNNER: RunnerErrors = {
  isAssertion: () => false,
  skipReason: (e) =>
    (e as { code?: unknown } | null)?.code === "RUNNER_SKIP"
      ? "runner said so"
      : undefined,
};

const processContext = (
  env: Record<string, string> = {},
  options: QualifyOptions = {},
) => {
  const settings = SettingsResolver.resolve(env, options);
  const writer = new MemoryWriter();
  const warnings: string[] = [];
  const context: ProcessContext = {
    envelope: Envelope.build({
      env,
      environment: settings.environment,
      git: {
        root: "/repo",
        commit: "a".repeat(40),
        branch: "main",
        dirty: false,
      },
      policy: Policy.info(settings),
      runId: RUN,
      tool: {
        name: "@lekman/qualify",
        version: "0.1.0",
        language: "typescript",
        runtime: "bun; test",
      },
    }),
    evidenceDir: "/evidence",
    now: steppingClock(),
    registry: new SecretRegistry(),
    settings,
    sites: SITES,
    warn: (m) => warnings.push(m),
    writer,
  };
  return { context, writer, warnings };
};

const declare = (
  id = "OQ-EXEC-001",
  extra: object = {},
): Extract<Registration, { valid: true }> => {
  const registration = Execution.declare(
    "OQ",
    id,
    "a test",
    { ...narrative, ...extra },
    new Error().stack,
    SITES,
  );
  if (!registration.valid) throw registration.error;
  return registration;
};

const files = (writer: MemoryWriter) => {
  const entries = [...writer.files.entries()];
  const marker = entries.find(([p]) => p.endsWith(".started"));
  const record = entries.find(([p]) => p.endsWith(".json"));
  return {
    names: entries.map(([p]) => p),
    marker: marker ? (JSON.parse(String(marker[1])) as StartedFile) : undefined,
    record: record ? (JSON.parse(String(record[1])) as RecordFile) : undefined,
  };
};

const run = async (
  body: (ctx: QualifyContext) => unknown,
  env: Record<string, string> = {},
  options: QualifyOptions = {},
  registration = declare(),
): Promise<{
  result: RunResult;
  record: RecordFile;
  marker: StartedFile;
  names: string[];
}> => {
  const { context, writer } = processContext(env, options);
  const result = await Execution.run(
    registration,
    async (ctx) => void (await body(ctx)),
    undefined,
    context,
    RUNNER,
  );
  const written = files(writer);
  expect(Schema.evidence(written.marker)).toEqual([]);
  expect(Schema.evidence(written.record)).toEqual([]);
  return {
    result,
    ...(written as { marker: StartedFile; record: RecordFile }),
    names: written.names,
  };
};

describe("Execution.declare", () => {
  test("a valid declaration takes its site from the caller", () => {
    const registration = declare();
    expect(registration.name).toBe("[OQ-EXEC-001] a test");
    expect(registration.declared.declaration.site).toMatch(
      /^tests\/execution\/execution\.test\.ts:\d+$/,
    );
    expect(registration.file).toBe(import.meta.path);
  });

  test("an invalid declaration is returned, not thrown", () => {
    const registration = Execution.declare(
      "OQ",
      "OQ-EXEC-002",
      "t",
      { given: "g", when: "w", then: "t" },
      new Error().stack,
      SITES,
    );
    expect(registration.valid).toBe(false);
    expect(registration.name).toBe("[OQ-EXEC-002] t");
    if (!registration.valid)
      expect(registration.error).toBeInstanceOf(DeclarationError);
  });

  test("no test file in the stack is a declaration error", () => {
    const registration = Execution.declare(
      "OQ",
      "OQ-EXEC-003",
      "t",
      narrative,
      undefined,
      SITES,
    );
    expect(registration.valid).toBe(false);
  });
});

describe("Execution.run", () => {
  test("a passing test writes a marker and a record", async () => {
    const { result, marker, record, names } = await run((ctx) => {
      ctx.check("c", "one").that(1).equals(1);
    });
    expect(result).toEqual({ outcome: "pass" });
    expect(names.map((n) => n.replace(/^\/evidence\/records\//, ""))).toEqual([
      expect.stringMatching(
        new RegExp(`^${RUN}__OQ-EXEC-001__[0-9a-f]{8}\\.started$`),
      ),
      expect.stringMatching(
        new RegExp(`^${RUN}__OQ-EXEC-001__[0-9a-f]{8}\\.json$`),
      ),
    ]);
    expect(marker.test.startedAt).toBe(record.test.startedAt);
    expect(record.test).toMatchObject({
      outcome: "pass",
      durationMs: expect.any(Number),
      secretsUsed: [],
    });
    expect(record.test.checks[0]?.site).toMatch(
      /^tests\/execution\/execution\.test\.ts:\d+$/,
    );
  });

  test("a hard check failure fails at the check's site", async () => {
    const { result, record } = await run((ctx) => {
      ctx.check("c", "fails").that(1).equals(2);
    });
    expect(result.outcome).toBe("fail");
    expect(CheckFailed.is((result as { rethrow: unknown }).rethrow)).toBe(true);
    expect(record.test.error).toEqual({
      type: "CheckFailed",
      message: "c: fails",
      site: record.test.checks[0]?.site as string,
    });
  });

  test("a soft failure fails at the end of the body", async () => {
    const { result, record } = await run((ctx) => {
      ctx.check("c", "soft").soft().that(1).equals(2);
    });
    expect(result.outcome).toBe("fail");
    expect((result as { rethrow: Error }).rethrow.message).toBe(
      "1 soft check(s) failed",
    );
    expect(record.test.error?.site).toBe(record.test.checks[0]?.site as string);
  });

  test("a thrown error is redacted in the record and in the rethrown error", async () => {
    const { result, record } = await run(
      (ctx) => {
        const token = ctx.secret("TOKEN");
        ctx.attach("note.txt", `token ${token}`, "text/plain");
        throw new Error(`failed with ${token}`);
      },
      { QUALIFY_SECRET_TOKEN: "s3cr3t-value-123" },
    );
    expect(result.outcome).toBe("error");
    const rethrown = (result as { rethrow: Error }).rethrow;
    expect(rethrown.message).toBe("failed with [REDACTED]");
    expect(rethrown.stack).not.toContain("s3cr3t-value-123");
    expect(record.test.error).toMatchObject({
      type: "Error",
      message: "failed with [REDACTED]",
    });
    expect(record.test.error?.site).toMatch(/execution\.test\.ts:\d+$/);
    expect(JSON.stringify(record)).not.toContain("s3cr3t-value-123");
    expect(record.test.secretsUsed).toEqual(["TOKEN"]);
  });

  test("an error thrown outside the test file has no site", async () => {
    const error = new Error("elsewhere");
    error.stack = "Error: elsewhere\n    at x (/nowhere/file.js:1:1)";
    const { record } = await run(() => {
      throw error;
    });
    expect(record.test.error?.site).toBeNull();
  });

  test("ctx.skip records skip and asks the runner to skip", async () => {
    const { result, record } = await run((ctx) => ctx.skip("not seeded"));
    expect(result).toEqual({ outcome: "skip", reason: "not seeded" });
    expect(record.test.skipReason).toBe("not seeded");
    expect(record.test.error).toBeUndefined();
  });

  test("the runner's own skip is recorded and thrown back", async () => {
    const skip = Object.assign(new Error("skip"), { code: "RUNNER_SKIP" });
    const { result } = await run(() => {
      throw skip;
    });
    expect(result).toEqual({
      outcome: "skip",
      reason: "runner said so",
      rethrow: skip,
    });
  });

  test("the policy skips a read-write test in production without running it", async () => {
    let ran = false;
    const { result, record, marker } = await run(
      () => {
        ran = true;
      },
      { QUALIFY_ENVIRONMENT: "production" },
      {},
      declare("OQ-EXEC-004", { scope: "read-write" }),
    );
    expect(ran).toBe(false);
    expect(result).toEqual({
      outcome: "skip",
      reason: "read-write test blocked in production environment production",
    });
    expect(record.test.checks).toEqual([]);
    expect(marker.run.policy.productionWriteBlocked).toBe(true);
  });

  test("a delegate the body did not await still decides the outcome", async () => {
    const { result, record } = await run((ctx) => {
      void ctx
        .delegate("helper", "late failure", async () => {
          throw new RangeError("late");
        })
        .catch(() => undefined);
    });
    expect(result.outcome).toBe("error");
    expect(record.test.error?.type).toBe("RangeError");
  });

  test("the marker is redacted with values already registered", async () => {
    const { context, writer } = processContext();
    context.registry.add("known-secret-1");
    const registration = declare("OQ-EXEC-005", {
      given: "uses known-secret-1",
    });
    await Execution.run(
      registration,
      () => undefined,
      undefined,
      context,
      RUNNER,
    );
    expect([...writer.files.values()].join("")).not.toContain("known-secret-1");
  });
});

describe("Execution.finish", () => {
  test("maps each result to the runner", () => {
    const skipped: string[] = [];
    Execution.finish({ outcome: "pass" }, (r) => skipped.push(r));
    Execution.finish({ outcome: "skip", reason: "why" }, (r) =>
      skipped.push(r),
    );
    expect(skipped).toEqual(["why"]);
    expect(() =>
      Execution.finish(
        { outcome: "skip", reason: "r", rethrow: new Error("own") },
        () => undefined,
      ),
    ).toThrow("own");
    expect(() =>
      Execution.finish(
        { outcome: "fail", rethrow: new Error("f") },
        () => undefined,
      ),
    ).toThrow("f");
  });
});

describe("Execution.declareAt", () => {
  test("takes the site from the frame the runner gives", () => {
    const registration = Execution.declareAt(
      "OQ",
      "OQ-EXEC-010",
      "a scenario",
      narrative,
      { path: join(SITES.root, "features/cart.feature"), line: 7 },
      SITES,
    );
    expect(registration.valid).toBe(true);
    if (!registration.valid) return;
    expect(registration.declared.declaration.site).toBe(
      "features/cart.feature:7",
    );
  });

  test("refuses a declaration without a frame", () => {
    const registration = Execution.declareAt(
      "OQ",
      "OQ-EXEC-011",
      "a scenario",
      narrative,
      undefined,
      SITES,
    );
    expect(registration.valid).toBe(false);
    if (registration.valid) return;
    expect(registration.error.message).toContain("could not find");
  });
});

describe("Execution.start and Execution.end", () => {
  test("a body that spans several calls uses the runner's sites", async () => {
    const { context, writer } = processContext();
    let step = "features/cart.feature:8";
    const started = await Execution.start(declare("OQ-EXEC-012"), context, {
      check: () => step,
      failure: () => step,
    });
    expect(files(writer).marker?.test.id).toBe("OQ-EXEC-012");
    expect(files(writer).record).toBeUndefined();
    started.ctx.check("cart", "has items").that(2).equals(2);
    step = "features/cart.feature:9";
    const result = await Execution.end(
      started,
      { error: new TypeError("broken") },
      RUNNER,
    );
    expect(result.outcome).toBe("error");
    const { record } = files(writer);
    expect(record?.test.checks[0]?.site).toBe("features/cart.feature:8");
    expect(record?.test.error?.site).toBe("features/cart.feature:9");
  });

  test("a failed check keeps its own site over the runner's", async () => {
    const { context, writer } = processContext();
    const started = await Execution.start(declare("OQ-EXEC-013"), context, {
      check: () => "features/a.feature:3",
      failure: () => "features/a.feature:4",
    });
    let thrown: undefined | { error: unknown };
    try {
      started.ctx.check("cart", "is empty").that(1).equals(0);
    } catch (error) {
      thrown = { error };
    }
    await Execution.end(started, thrown, RUNNER);
    expect(files(writer).record?.test.error?.site).toBe("features/a.feature:3");
  });

  test("a policy skip is set at start and ends the test as a skip", async () => {
    const { context, writer } = processContext({
      QUALIFY_ENVIRONMENT: "production",
    });
    const started = await Execution.start(
      declare("OQ-EXEC-014", { scope: "read-write" }),
      context,
    );
    expect(started.policySkip).toContain("blocked in production");
    const result = await Execution.end(
      started,
      { error: new Error("ignored") },
      RUNNER,
    );
    expect(result).toEqual({
      outcome: "skip",
      reason: started.policySkip as string,
    });
    expect(files(writer).record?.test.outcome).toBe("skip");
  });
});

describe("Execution.redactError", () => {
  test("redacts registered values in the message and stack", () => {
    const { context } = processContext();
    context.registry.add("known-secret-2");
    const error = new Error("failed with known-secret-2");
    Execution.redactError(error, context);
    expect(error.message).toBe("failed with [REDACTED]");
    expect(error.stack).not.toContain("known-secret-2");
    expect(() => Execution.redactError("text", context)).not.toThrow();
  });
});
