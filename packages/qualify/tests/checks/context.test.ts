import { describe, expect, test } from "bun:test";

import type { ContextSettings } from "../../src/checks";

import {
  AttachmentTooLarge,
  CheckFailed,
  SecretNotFound,
  SecretRegistry,
  SkipSignal,
  TestContext,
} from "../../src/checks";
import { steppingClock } from "../mocks/memory.mock";

const settings = (
  overrides: Partial<ContextSettings> = {},
): ContextSettings & { warnings: string[] } => {
  const warnings: string[] = [];
  return {
    attachmentLimit: 100,
    environment: "staging",
    id: "OQ-A1-001",
    level: "OQ",
    now: steppingClock(),
    readSecret: (name) => ({ TOKEN: "token-value-1", SHORT: "abc" })[name],
    registry: new SecretRegistry(),
    runContext: () => ({
      actor: { name: "ci", ci: null, ciRunUrl: null },
      source: { commit: null, branch: "main", dirty: false },
      target: { digest: null },
    }),
    site: () => "t.ts:1",
    warn: (message) => warnings.push(message),
    warnings,
    ...overrides,
  };
};

describe("TestContext checks", () => {
  test("records hard checks and throws on the first failure", () => {
    const ctx = new TestContext(settings());
    expect(ctx.id).toBe("OQ-A1-001");
    expect(ctx.level).toBe("OQ");
    expect(ctx.environment).toBe("staging");
    expect(ctx.check("fixture", "one").that(1).equals(1)).toBe(true);
    expect(() => ctx.check("fixture", "two").that(2).equals(3)).toThrow(
      CheckFailed,
    );
    const checks = ctx.checks();
    expect(checks.map((c) => [c.seq, c.pass, c.soft, c.site])).toEqual([
      [0, true, false, "t.ts:1"],
      [1, false, false, "t.ts:1"],
    ]);
    expect(checks[0]?.at).toBe("2026-01-02T03:04:05.000Z");
  });

  test("CheckFailed carries the message and site", () => {
    const ctx = new TestContext(settings());
    try {
      ctx.check("fixture", "second fails").that(2).equals(3);
    } catch (error) {
      expect(CheckFailed.is(error)).toBe(true);
      expect((error as CheckFailed).message).toBe("fixture: second fails");
      expect((error as CheckFailed).site).toBe("t.ts:1");
    }
    expect(CheckFailed.is(new Error("x"))).toBe(false);
  });

  test("soft checks record and continue", () => {
    const ctx = new TestContext(settings());
    expect(ctx.check("fixture", "soft").soft().that("a").equals("b")).toBe(
      false,
    );
    ctx.check("fixture", "hard").that(true).isTrue();
    expect(ctx.softFailures().map((c) => c.description)).toEqual(["soft"]);
  });

  test("every matcher is wired", () => {
    const ctx = new TestContext(settings());
    const a = (value: unknown) => ctx.check("c", "d").soft().that(value);
    a(1).notEquals(2);
    a("abc").contains("b");
    a("abc").matches(/b/);
    a(false).isFalse();
    a(null).isNull();
    a(1).isNotNull();
    a([1]).hasLength(1);
    a(2).atLeast(1);
    a(2).atMost(3);
    a(2).oneOf([1, 2]);
    expect(ctx.checks().map((c) => c.matcher)).toEqual([
      "notEquals",
      "contains",
      "matches",
      "isFalse",
      "isNull",
      "isNotNull",
      "hasLength",
      "atLeast",
      "atMost",
      "oneOf",
    ]);
    expect(ctx.softFailures()).toEqual([]);
  });

  test("context and description must not be empty", () => {
    const ctx = new TestContext(settings());
    expect(() => ctx.check("", "d")).toThrow(TypeError);
    expect(() => ctx.check("c", "")).toThrow(TypeError);
  });
});

describe("TestContext.delegate", () => {
  test("a synchronous function that completes", () => {
    const ctx = new TestContext(settings());
    function helper(): number {
      return 4;
    }
    expect(ctx.delegate("helper", "returns", helper)).toBe(4);
    expect(ctx.checks()[0]).toMatchObject({
      matcher: "delegate",
      expected: "completes",
      actual: "completed",
      pass: true,
      delegate: "helper",
    });
  });

  test("a synchronous failure keeps its own type", () => {
    const ctx = new TestContext(settings());
    expect(() =>
      ctx.delegate("helper", "fails", () => {
        throw new RangeError("helper failed");
      }),
    ).toThrow(RangeError);
    expect(ctx.checks()[0]).toMatchObject({
      actual: "helper failed",
      pass: false,
      delegate: "anonymous",
    });
  });

  test("asynchronous work, awaited or left to settle", async () => {
    const ctx = new TestContext(settings());
    expect(await ctx.delegate("a", "resolves", async () => 1)).toBe(1);
    void ctx
      .delegate("b", "rejects", async () => {
        throw "plain";
      })
      .catch(() => undefined);
    const late = await ctx.settle();
    expect(late?.error).toBe("plain");
    expect(ctx.checks().map((c) => [c.seq, c.actual])).toEqual([
      [0, "completed"],
      [1, "plain"],
    ]);
    expect(() => ctx.delegate("c", "d", 5 as never)).toThrow(TypeError);
  });

  test("settle with nothing pending", async () => {
    expect(await new TestContext(settings()).settle()).toBeUndefined();
  });
});

describe("TestContext attachments", () => {
  test("strings, bytes and JSON", () => {
    const ctx = new TestContext(settings());
    ctx.attach("note.txt", "hi", "text/plain");
    ctx.attach(
      "blob.bin",
      new Uint8Array([1, 2]).buffer,
      "application/octet-stream",
    );
    ctx.attach(
      "view.bin",
      new DataView(new Uint8Array([3]).buffer),
      "application/octet-stream",
    );
    ctx.attach("doc.json", { b: 1 }, "application/json; charset=utf-8");
    ctx.attach("text.json", '{"a":1}', "application/json");
    ctx.attach("broken.json", "{not json", "application/json");
    expect(ctx.attachments().map((a) => [a.filename, a.kind])).toEqual([
      ["note.txt", "bytes"],
      ["blob.bin", "bytes"],
      ["view.bin", "bytes"],
      ["doc.json", "json"],
      ["text.json", "json"],
      ["broken.json", "bytes"],
    ]);
  });

  test("invalid attachments", () => {
    const ctx = new TestContext(settings());
    expect(() => ctx.attach("a/b.txt", "x", "text/plain")).toThrow(TypeError);
    expect(() => ctx.attach("", "x", "text/plain")).toThrow(TypeError);
    expect(() => ctx.attach("a.txt", "x", "")).toThrow(TypeError);
    expect(() => ctx.attach("a.txt", { a: 1 }, "text/plain")).toThrow(
      TypeError,
    );
  });

  test("an attachment over the limit ends the test and is not kept", () => {
    const ctx = new TestContext(settings({ attachmentLimit: 16 }));
    ctx.attach("ok.txt", "a".repeat(16), "text/plain");
    expect(() => ctx.attach("big.txt", "a".repeat(17), "text/plain")).toThrow(
      new AttachmentTooLarge(
        "attachment big.txt is 17 bytes, over the limit of 16 bytes",
      ),
    );
    expect(() =>
      ctx.attach("big.json", { a: "x".repeat(20) }, "application/json"),
    ).toThrow(AttachmentTooLarge);
    expect(ctx.attachments()).toHaveLength(1);
  });

  test("runContext attaches the envelope facts and extra values", () => {
    const ctx = new TestContext(settings({ attachmentLimit: 1024 }));
    ctx.runContext({ build: 7, missing: undefined });
    const [attachment] = ctx.attachments();
    expect(attachment).toEqual({
      kind: "json",
      filename: "run-context.json",
      contentType: "application/json",
      value: {
        actor: { name: "ci", ci: null, ciRunUrl: null },
        extra: { build: 7, missing: null },
        source: { commit: null, branch: "main", dirty: false },
        target: { digest: null },
      },
    });
  });
});

describe("TestContext secrets and skip", () => {
  test("secret reads, registers and lists the name", () => {
    const s = settings();
    const ctx = new TestContext(s);
    expect(ctx.secret("TOKEN")).toBe("token-value-1");
    expect(s.registry.values()).toEqual(["token-value-1"]);
    expect(ctx.secretsUsed()).toEqual(["TOKEN"]);
  });

  test("a missing secret and a bad name", () => {
    const ctx = new TestContext(settings());
    expect(() => ctx.secret("ABSENT")).toThrow(SecretNotFound);
    expect(() => ctx.secret("bad-name")).toThrow(TypeError);
  });

  test("a value shorter than 6 characters is refused with a warning", () => {
    const s = settings();
    const ctx = new TestContext(s);
    expect(ctx.secret("SHORT")).toBe("abc");
    expect(s.registry.values()).toEqual([]);
    expect(s.warnings[0]).toContain("shorter than 6 characters");
    expect(() => ctx.redact(5 as never)).toThrow(TypeError);
  });

  test("skip ends the body with a reason", () => {
    const ctx = new TestContext(settings());
    try {
      ctx.skip("not seeded");
    } catch (error) {
      expect(SkipSignal.is(error)).toBe(true);
      expect((error as SkipSignal).reason).toBe("not seeded");
    }
    expect(() => ctx.skip("")).toThrow(TypeError);
    expect(SkipSignal.is("x")).toBe(false);
  });
});
