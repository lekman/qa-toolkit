import { describe, expect, test } from "bun:test";

import type { RunnerErrors } from "../../src/outcome";

import { CheckFailed, SkipSignal } from "../../src/checks";
import { Outcomes } from "../../src/outcome";

const runner: RunnerErrors = {
  isAssertion: (e) => e instanceof Error && e.message.startsWith("expect("),
  skipReason: (e) =>
    (e as { code?: string } | null)?.code === "SKIP"
      ? "runner skip"
      : undefined,
};

describe("Outcomes.classify", () => {
  test("pass, and a soft failure when the body completed", () => {
    expect(Outcomes.classify(undefined, 0, runner)).toEqual({
      outcome: "pass",
    });
    expect(Outcomes.classify(undefined, 2, runner)).toEqual({
      outcome: "fail",
      failure: { type: "CheckFailed", message: "2 soft check(s) failed" },
    });
  });

  test("a failed check is fail", () => {
    expect(
      Outcomes.classify({ error: new CheckFailed("c: d", "s:1") }, 1, runner),
    ).toEqual({
      outcome: "fail",
      failure: { type: "CheckFailed", message: "c: d" },
    });
  });

  test("skips", () => {
    expect(
      Outcomes.classify({ error: new SkipSignal("why") }, 0, runner),
    ).toEqual({
      outcome: "skip",
      skipReason: "why",
    });
    expect(
      Outcomes.classify(
        { error: Object.assign(new Error(), { code: "SKIP" }) },
        0,
        runner,
      ),
    ).toEqual({
      outcome: "skip",
      skipReason: "runner skip",
    });
  });

  test("assertion errors are fail", () => {
    class AssertionError extends Error {}
    expect(
      Outcomes.classify({ error: new AssertionError("x") }, 0, runner).outcome,
    ).toBe("fail");
    expect(
      Outcomes.classify(
        { error: Object.assign(new Error("y"), { code: "ERR_ASSERTION" }) },
        0,
        runner,
      ).outcome,
    ).toBe("fail");
    expect(
      Outcomes.classify({ error: new Error("expect(1).toBe(2)") }, 0, runner),
    ).toEqual({
      outcome: "fail",
      failure: { type: "Error", message: "expect(1).toBe(2)" },
    });
  });

  test("anything else is error, with its type name", () => {
    expect(Outcomes.classify({ error: new Error("boom") }, 0, runner)).toEqual({
      outcome: "error",
      failure: { type: "Error", message: "boom" },
    });
    expect(
      Outcomes.classify({ error: new TypeError("t") }, 0, runner).failure?.type,
    ).toBe("TypeError");
    expect(Outcomes.classify({ error: "text" }, 0, runner).failure).toEqual({
      type: "string",
      message: "text",
    });
    expect(
      Outcomes.classify({ error: { message: "m" } }, 0, runner).failure,
    ).toEqual({ type: "Object", message: "m" });
    expect(Outcomes.classify({ error: null }, 0, runner).failure).toEqual({
      type: "null",
      message: "null",
    });
  });

  test("type names prefer the class, then the name", () => {
    class Custom extends Error {}
    expect(Outcomes.typeName(new Custom())).toBe("Custom");
    expect(
      Outcomes.typeName(Object.assign(new Error(), { name: "Named" })),
    ).toBe("Named");
    expect(Outcomes.typeName(Object.create(null))).toBe("Error");
    expect(Outcomes.typeName(undefined)).toBe("undefined");
  });
});
