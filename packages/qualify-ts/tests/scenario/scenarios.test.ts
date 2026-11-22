import { describe, expect, test } from "bun:test";

import type { ScenarioSource, ScenarioStep } from "../../src/scenario";

import { DeclarationError } from "../../src/declaration";
import { Outcomes } from "../../src/outcome";
import { Scenarios } from "../../src/scenario";

const step = (type: string, text: string, id = text): ScenarioStep => ({
  astNodeIds: [id],
  text,
  type,
});

const STEPS = [
  step("Context", "a cart with two items"),
  step("Action", "the customer pays"),
  step("Outcome", "the order is confirmed"),
];

const scenario = (extra: Partial<ScenarioSource> = {}): ScenarioSource => ({
  astNodeIds: ["s1"],
  location: { line: 7 },
  name: "OQ-CART-001 The order keeps every item",
  steps: STEPS,
  tags: [{ name: "@scope-read" }],
  uri: "features/cart.feature",
  ...extra,
});

const problems = (source: ScenarioSource): readonly string[] => {
  try {
    Scenarios.declaration(source);
  } catch (error) {
    expect(error).toBeInstanceOf(DeclarationError);
    return (error as DeclarationError).problems;
  }
  throw new Error("no declaration error");
};

describe("Scenarios.declaration", () => {
  test("reads the ID, level, title and line from the scenario", () => {
    const declared = Scenarios.declaration(scenario());
    expect(declared.id).toBe("OQ-CART-001");
    expect(declared.level).toBe("OQ");
    expect(declared.title).toBe("The order keeps every item");
    expect(declared.line).toBe(7);
  });

  test("reads given, when and then from the steps", () => {
    const { narrative } = Scenarios.declaration(scenario());
    expect(narrative.given).toBe("a cart with two items");
    expect(narrative.when).toBe("the customer pays");
    expect(narrative.then).toBe("the order is confirmed");
    expect(narrative.and).toBeUndefined();
  });

  test("joins further Given and When steps with and", () => {
    const { narrative } = Scenarios.declaration(
      scenario({
        steps: [
          step("Context", "a cart"),
          step("Context", "a voucher"),
          step("Action", "the customer pays"),
          step("Action", "waits a minute"),
          step("Outcome", "the order is confirmed"),
        ],
      }),
    );
    expect(narrative.given).toBe("a cart and a voucher");
    expect(narrative.when).toBe("the customer pays and waits a minute");
  });

  test("makes each step after the first Then an and clause, with its keyword when it is not a Then", () => {
    const { narrative } = Scenarios.declaration(
      scenario({
        steps: [
          ...STEPS,
          step("Outcome", "a receipt is sent"),
          step("Action", "the customer cancels"),
          step("Context", "a refund policy"),
          step("Unknown", "the order is closed"),
        ],
      }),
    );
    expect(narrative.and).toEqual([
      "a receipt is sent",
      "When the customer cancels",
      "Given a refund policy",
      "the order is closed",
    ]);
  });

  test("maps the reserved tags and keeps the others without @", () => {
    const { narrative } = Scenarios.declaration(
      scenario({
        tags: [
          { name: "@REQ-CART-001" },
          { name: "@REQ-CART-002" },
          { name: "@risk-high" },
          { name: "@scope-read-write" },
          { name: "@controls-OQ-CART-002" },
          { name: "@checkout" },
          { name: "@checkout" },
        ],
      }),
    );
    expect(narrative.requirements).toEqual(["REQ-CART-001", "REQ-CART-002"]);
    expect(narrative.risk).toBe("high");
    expect(narrative.scope).toBe("read-write");
    expect(narrative.controls).toBe("OQ-CART-002");
    expect(narrative.tags).toEqual(["checkout"]);
  });

  test("leaves scope out when no tag gives it", () => {
    const { narrative } = Scenarios.declaration(
      scenario({ name: "IU-CART-001 A customer buys", tags: [] }),
    );
    expect(narrative.scope).toBeUndefined();
    expect(narrative.risk).toBeUndefined();
    expect(narrative.controls).toBeUndefined();
  });

  test("refuses a name without a test ID", () => {
    const found = problems(scenario({ name: "The order keeps every item" }));
    expect(found[0]).toContain("the scenario name must be the test ID");
  });

  test("refuses a prefix that is not a level", () => {
    expect(problems(scenario({ name: "XQ-CART-001 Title" }))[0]).toContain(
      "test ID",
    );
    expect(problems(scenario({ name: "OQCART001 Title" }))[0]).toContain(
      "test ID",
    );
  });

  test("passes a malformed ID with a level prefix on, for the pattern check", () => {
    expect(Scenarios.declaration(scenario({ name: "OQ-cart-1 x" })).id).toBe(
      "OQ-cart-1",
    );
  });

  test("gives an empty title when the name is only the ID", () => {
    expect(Scenarios.declaration(scenario({ name: "OQ-CART-001" })).title).toBe(
      "",
    );
  });

  test("refuses a row of a Scenario Outline", () => {
    const found = problems(scenario({ astNodeIds: ["s1", "row1"] }));
    expect(found[0]).toContain("Scenario Outline");
  });

  test("refuses steps out of Given, When, Then order", () => {
    for (const steps of [
      [step("Action", "a"), step("Outcome", "b")],
      [step("Context", "a"), step("Outcome", "b"), step("Action", "c")],
      [step("Context", "a"), step("Action", "b")],
      [
        step("Context", "a"),
        step("Action", "b"),
        step("Context", "c"),
        step("Outcome", "d"),
      ],
      [step("Unknown", "a"), step("Action", "b"), step("Outcome", "c")],
    ]) {
      expect(problems(scenario({ steps }))[0]).toContain(
        "one or more Given steps",
      );
    }
  });

  test("refuses a second risk, scope or control tag", () => {
    const found = problems(
      scenario({
        tags: [
          { name: "@risk-high" },
          { name: "@risk-low" },
          { name: "@scope-read" },
          { name: "@scope-read-write" },
          { name: "@controls-OQ-A-001" },
          { name: "@controls-OQ-B-001" },
        ],
      }),
    );
    expect(found).toEqual([
      "more than one @risk- tag: high, low",
      "more than one @scope- tag: read, read-write",
      "more than one @controls- tag: OQ-A-001, OQ-B-001",
    ]);
  });

  test("names the ID in the error", () => {
    try {
      Scenarios.declaration(scenario({ steps: [] }));
    } catch (error) {
      expect((error as DeclarationError).testId).toBe("OQ-CART-001");
    }
  });

  test("defaults the line to 1 when the scenario has no location", () => {
    expect(Scenarios.declaration(scenario({ location: undefined })).line).toBe(
      1,
    );
  });
});

describe("Scenarios.lines", () => {
  test("maps scenarios, backgrounds, steps, rules and example rows to lines", () => {
    const at = (id: string, line: number) => ({ id, location: { line } });
    const lines = Scenarios.lines({
      feature: {
        children: [
          { background: { ...at("bg", 2), steps: [at("bg1", 3)] } },
          {
            scenario: {
              ...at("s1", 5),
              steps: [at("st1", 6)],
              examples: [{ tableBody: [at("row1", 9)] }],
            },
          },
          {
            rule: {
              children: [
                { scenario: { ...at("s2", 12), steps: [at("st2", 13)] } },
              ],
            },
          },
        ],
      },
    });
    expect(Object.fromEntries(lines)).toEqual({
      bg: 2,
      bg1: 3,
      s1: 5,
      st1: 6,
      row1: 9,
      s2: 12,
      st2: 13,
    });
  });

  test("returns nothing for a document without a feature", () => {
    expect(Scenarios.lines({}).size).toBe(0);
  });
});

describe("Scenarios.ending", () => {
  const classify = (status: string, extra: object = {}) =>
    Outcomes.classify(
      Scenarios.ending({ status, ...extra }),
      0,
      Scenarios.RUNNER,
    );

  test("a passed or missing result threw nothing", () => {
    expect(Scenarios.ending(undefined)).toBeUndefined();
    expect(Scenarios.ending({ status: "PASSED" })).toBeUndefined();
  });

  test("a skipped scenario is a skip", () => {
    expect(classify("SKIPPED")).toEqual({
      outcome: "skip",
      skipReason: "skipped by cucumber",
    });
  });

  test("pending, undefined and ambiguous steps are errors", () => {
    expect(classify("PENDING").failure).toEqual({
      type: "PendingStep",
      message: "a step is pending",
    });
    expect(classify("UNDEFINED").failure?.type).toBe("UndefinedStep");
    expect(classify("AMBIGUOUS").failure?.type).toBe("AmbiguousStep");
  });

  test("a failure keeps the type and message cucumber reported", () => {
    expect(
      classify("FAILED", {
        exception: { type: "TimeoutError", message: "too slow" },
      }),
    ).toEqual({
      outcome: "error",
      failure: { type: "TimeoutError", message: "too slow" },
    });
    expect(
      classify("FAILED", { exception: { type: "AssertionError" } }).outcome,
    ).toBe("fail");
    expect(classify("FAILED", { message: "hook failed" }).failure).toEqual({
      type: "Error",
      message: "hook failed",
    });
    expect(classify("UNKNOWN").failure?.message).toBe(
      "the scenario ended as UNKNOWN",
    );
  });

  test("the runner reads no skip from other values", () => {
    expect(Scenarios.RUNNER.skipReason(null)).toBeUndefined();
    expect(Scenarios.RUNNER.skipReason("x")).toBeUndefined();
    expect(Scenarios.RUNNER.skipReason(new Error("x"))).toBeUndefined();
    expect(Scenarios.RUNNER.isAssertion(new Error("x"))).toBe(false);
  });
});
