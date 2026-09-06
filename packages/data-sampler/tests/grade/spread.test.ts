import { describe, expect, test } from "bun:test";

import { Spread } from "../../src/grade";
import { SpreadError } from "../../src/sampler/errors";
import { ScriptedRandom } from "../mocks/random.mock";

const scale = ["normal", "warning", "ill", "impossible"] as const;

describe("Spread.parse", () => {
  test("reads fractions", () => {
    expect(Spread.parse("normal:0.9,ill:0.1")).toEqual({
      ill: 0.1,
      normal: 0.9,
    });
  });

  test("reads percentages, which validate to the same fractions", () => {
    const parsed = Spread.parse("normal:90,ill:10");
    expect(parsed).toEqual({ ill: 10, normal: 90 });
    expect(Spread.validate(parsed, scale)).toEqual({ ill: 0.1, normal: 0.9 });
  });

  test.each([
    "",
    "normal",
    "normal:x",
    "normal:0.5,normal:0.5",
    "normal:",
    "a:b:c",
  ])("rejects %j", (text) => {
    expect(() => Spread.parse(text)).toThrow(SpreadError);
  });
});

describe("Spread.validate", () => {
  test("accepts weights that sum to 1", () => {
    expect(Spread.validate({ ill: 0.1, normal: 0.9 }, scale)).toEqual({
      ill: 0.1,
      normal: 0.9,
    });
  });

  test("rejects a negative weight", () => {
    expect(() => Spread.validate({ ill: -0.1, normal: 1.1 }, scale)).toThrow(
      SpreadError,
    );
  });

  test("rejects a sum of 0.95", () => {
    expect(() => Spread.validate({ ill: 0.05, normal: 0.9 }, scale)).toThrow(
      /sum to 1/,
    );
  });

  test("rejects a key outside the scale", () => {
    expect(() => Spread.validate({ dead: 0.1, normal: 0.9 }, scale)).toThrow(
      /not in the scale/,
    );
  });

  test('rejects a key named "default"', () => {
    expect(() => Spread.validate({ default: 0.1, normal: 0.9 }, scale)).toThrow(
      /default/,
    );
  });

  test("rejects an empty spread", () => {
    expect(() => Spread.validate({}, scale)).toThrow(SpreadError);
  });
});

describe("Spread.allocate", () => {
  test("gives exact counts for 90/10 over 1000", () => {
    expect(Spread.allocate({ ill: 0.1, normal: 0.9 }, 1000, scale)).toEqual({
      ill: 100,
      impossible: 0,
      normal: 900,
      warning: 0,
    });
  });

  test("hands the remainder of three thirds over 10 to the earlier grades", () => {
    const third = 1 / 3;
    const allocation = Spread.allocate(
      { ill: third, normal: third, warning: third },
      10,
      scale,
    );
    expect(Object.values(allocation).reduce((sum, n) => sum + n, 0)).toBe(10);
    expect(allocation).toEqual({
      ill: 3,
      impossible: 0,
      normal: 4,
      warning: 3,
    });
  });

  test("breaks a tie for a single record in favour of the earlier grade", () => {
    expect(Spread.allocate({ a: 0.5, b: 0.5 }, 1, ["a", "b"])).toEqual({
      a: 1,
      b: 0,
    });
  });

  test("allocates nothing for count 0", () => {
    expect(Spread.allocate({ a: 1 }, 0, ["a"])).toEqual({ a: 0 });
  });

  test.each([-1, 1.5, Number.NaN])("rejects count %p", (count) => {
    expect(() => Spread.allocate({ a: 1 }, count, ["a"])).toThrow(SpreadError);
  });
});

describe("Spread.sequence", () => {
  test("shuffles deterministically and preserves counts", () => {
    const allocation = { a: 3, b: 2 };
    const random = new ScriptedRandom([0.1, 0.9, 0.5]);
    const first = Spread.sequence(allocation, ["a", "b"], random);
    const second = Spread.sequence(
      allocation,
      ["a", "b"],
      new ScriptedRandom([0.1, 0.9, 0.5]),
    );
    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(first.filter((g) => g === "a")).toHaveLength(3);
    expect(first.filter((g) => g === "b")).toHaveLength(2);
    expect(first).not.toEqual(["a", "a", "a", "b", "b"]);
  });

  test("returns an empty sequence for an empty allocation", () => {
    expect(Spread.sequence({ a: 0 }, ["a"], new ScriptedRandom([0]))).toEqual(
      [],
    );
  });
});
