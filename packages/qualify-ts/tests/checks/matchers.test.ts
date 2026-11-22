import { describe, expect, test } from "bun:test";

import { Matchers } from "../../src/checks";

describe("Matchers.evaluate", () => {
  test("equals and notEquals compare after normalisation", () => {
    expect(Matchers.evaluate("equals", NaN, NaN)).toEqual({
      expected: "NaN",
      actual: "NaN",
      pass: true,
    });
    expect(Matchers.evaluate("equals", 2, 3)).toEqual({
      expected: 3,
      actual: 2,
      pass: false,
    });
    expect(Matchers.evaluate("notEquals", 2, 3).pass).toBe(true);
    expect(Matchers.evaluate("notEquals", { a: 1 }, { a: 1 }).pass).toBe(false);
  });

  test("contains: substrings and list elements", () => {
    expect(Matchers.evaluate("contains", "qualify", "ali")).toEqual({
      expected: "ali",
      actual: "qualify",
      pass: true,
    });
    expect(Matchers.evaluate("contains", [{ a: 1 }], { a: 1 }).pass).toBe(true);
    expect(Matchers.evaluate("contains", new Set([1]), 1).pass).toBe(true);
    expect(Matchers.evaluate("contains", 5, 5).pass).toBe(false);
  });

  test("matches records the pattern source and ignores the g flag", () => {
    expect(Matchers.evaluate("matches", "abc", /b+/g)).toEqual({
      expected: "b+",
      actual: "abc",
      pass: true,
    });
    expect(Matchers.evaluate("matches", "abc", "^z").pass).toBe(false);
    expect(Matchers.evaluate("matches", 5, "5").pass).toBe(false);
    expect(() => Matchers.evaluate("matches", "a", 5)).toThrow(TypeError);
  });

  test("boolean and null matchers", () => {
    expect(Matchers.evaluate("isTrue", true)).toEqual({
      expected: true,
      actual: true,
      pass: true,
    });
    expect(Matchers.evaluate("isTrue", 1).pass).toBe(false);
    expect(Matchers.evaluate("isFalse", false)).toEqual({
      expected: false,
      actual: false,
      pass: true,
    });
    expect(Matchers.evaluate("isNull", undefined)).toEqual({
      expected: null,
      actual: null,
      pass: true,
    });
    expect(Matchers.evaluate("isNull", 0).pass).toBe(false);
    expect(Matchers.evaluate("isNotNull", "")).toEqual({
      expected: "not null",
      actual: "",
      pass: true,
    });
    expect(Matchers.evaluate("isNotNull", null).pass).toBe(false);
  });

  test("hasLength records the measured length", () => {
    expect(Matchers.evaluate("hasLength", "a😀", 2)).toEqual({
      expected: 2,
      actual: 2,
      pass: true,
    });
    expect(Matchers.evaluate("hasLength", 5, 1)).toEqual({
      expected: 1,
      actual: null,
      pass: false,
    });
    expect(() => Matchers.evaluate("hasLength", "a", -1)).toThrow(TypeError);
  });

  test("atLeast and atMost with numbers and bigints", () => {
    expect(Matchers.evaluate("atLeast", 5, 5)).toEqual({
      expected: 5,
      actual: 5,
      pass: true,
    });
    expect(Matchers.evaluate("atLeast", 4.5, 5).pass).toBe(false);
    expect(Matchers.evaluate("atMost", 2n ** 60n, 2 ** 61).pass).toBe(true);
    expect(Matchers.evaluate("atLeast", 2n ** 60n, 1.5).pass).toBe(true);
    expect(Matchers.evaluate("atMost", 3n, 2.5).pass).toBe(false);
    expect(Matchers.evaluate("atLeast", 3, 3n).pass).toBe(true);
    expect(Matchers.evaluate("atMost", 1n, Infinity).pass).toBe(true);
    expect(Matchers.evaluate("atLeast", 1n, -Infinity).pass).toBe(true);
    expect(Matchers.evaluate("atLeast", NaN, 1).pass).toBe(false);
    expect(Matchers.evaluate("atLeast", "5", 1).pass).toBe(false);
    expect(() => Matchers.evaluate("atMost", 1, "2")).toThrow(TypeError);
  });

  test("oneOf records the list", () => {
    expect(Matchers.evaluate("oneOf", "b", ["a", "b"])).toEqual({
      expected: ["a", "b"],
      actual: "b",
      pass: true,
    });
    expect(Matchers.evaluate("oneOf", "c", ["a"]).pass).toBe(false);
    expect(() => Matchers.evaluate("oneOf", "c", "abc")).toThrow(TypeError);
  });
});
