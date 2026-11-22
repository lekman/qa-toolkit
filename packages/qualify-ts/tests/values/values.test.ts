import { describe, expect, test } from "bun:test";

import { JsonText, Values } from "../../src/values";

describe("Values.normalise", () => {
  test("keeps plain JSON values", () => {
    expect(Values.normalise({ a: [1, "x", true, null] })).toEqual({
      a: [1, "x", true, null],
    });
  });

  test("bytes become $bytes in base64", () => {
    expect(Values.normalise(new Uint8Array([1, 2]))).toEqual({
      $bytes: "AQI=",
    });
    expect(Values.normalise(new Uint8Array([1, 2]).buffer)).toEqual({
      $bytes: "AQI=",
    });
    expect(Values.normalise(Buffer.from([255]))).toEqual({ $bytes: "/w==" });
  });

  test("instants become UTC timestamps; an invalid date cannot be serialised", () => {
    expect(Values.normalise(new Date("2026-01-02T03:04:05.006Z"))).toBe(
      "2026-01-02T03:04:05.006Z",
    );
    expect(Values.normalise(new Date("nope"))).toBe("[unserialisable: Date]");
  });

  test("integers beyond 2^53 and non-finite numbers become strings", () => {
    expect(Values.normalise(2 ** 60)).toBe("1152921504606846976");
    expect(Values.normalise(-(2 ** 70))).toBe("-1180591620717411303424");
    expect(Values.normalise(2 ** 53)).toBe(2 ** 53);
    expect(Values.normalise(NaN)).toBe("NaN");
    expect(Values.normalise(Infinity)).toBe("Infinity");
    expect(Values.normalise(-Infinity)).toBe("-Infinity");
    expect(Object.is(Values.normalise(-0), 0)).toBe(true);
    expect(Values.normalise(1.5)).toBe(1.5);
  });

  test("bigints are numbers within 2^53 and strings beyond", () => {
    expect(Values.normalise(5n)).toBe(5);
    expect(Values.normalise(2n ** 60n)).toBe("1152921504606846976");
  });

  test("sets become sorted arrays", () => {
    expect(Values.normalise(new Set(["b", "a"]))).toEqual(["a", "b"]);
    expect(Values.normalise(new Set([10, 9]))).toEqual([9, 10]);
    expect(Values.normalise(new Set([1, "a"]))).toEqual(["a", 1]);
  });

  test("maps become objects", () => {
    expect(
      Values.normalise(
        new Map<unknown, unknown>([
          ["a", 1],
          [2, undefined],
        ]),
      ),
    ).toEqual({
      a: 1,
      "2": null,
    });
  });

  test("undefined is dropped from objects and null in arrays", () => {
    expect(Values.normalise({ a: undefined, b: 1 })).toEqual({ b: 1 });
    expect(Values.normalise([undefined])).toEqual([null]);
    expect(Values.normalise(undefined)).toBeNull();
  });

  test("a value holding a cycle becomes one unserialisable string", () => {
    const object: Record<string, unknown> = {};
    object.self = object;
    expect(Values.normalise(object)).toBe("[unserialisable: Object]");
    const list: unknown[] = [];
    list.push(list);
    expect(Values.normalise(list)).toBe("[unserialisable: Array]");
  });

  test("a value seen twice without a cycle is not a cycle", () => {
    const shared = { x: 1 };
    expect(Values.normalise([shared, shared])).toEqual([{ x: 1 }, { x: 1 }]);
  });

  test("functions, symbols, promises and errors cannot be serialised", () => {
    expect(Values.normalise(() => 1)).toBe("[unserialisable: Function]");
    expect(Values.normalise(Symbol("s"))).toBe("[unserialisable: Symbol]");
    expect(Values.normalise({ p: Promise.resolve() })).toEqual({
      p: "[unserialisable: Promise]",
    });
    expect(Values.normalise(new TypeError("x"))).toBe(
      "[unserialisable: TypeError]",
    );
  });

  test("toJSON and class instances", () => {
    expect(Values.normalise(new URL("https://example.com/a"))).toBe(
      "https://example.com/a",
    );
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
    }
    expect(Values.normalise(new Point(1, 2))).toEqual({ x: 1, y: 2 });
    expect(Values.normalise(/a+/g)).toBe("/a+/g");
  });
});

describe("Values.equal", () => {
  test("compares after normalisation", () => {
    expect(Values.equal(NaN, NaN)).toBe(true);
    expect(Values.equal({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(Values.equal(1, "1")).toBe(false);
    expect(Values.equal([1, 2], [2, 1])).toBe(false);
  });
});

describe("Values.compare", () => {
  test("orders by code point, not UTF-16 unit", () => {
    // U+FF61 sorts before U+1F600 by code point, after it by UTF-16 unit.
    expect(["😀", "｡"].sort(Values.compare)).toEqual(["｡", "😀"]);
    expect(["b", "a", "ab"].sort(Values.compare)).toEqual(["a", "ab", "b"]);
  });
});

describe("Values.lengthOf", () => {
  test("measures strings in code points and collections by size", () => {
    expect(Values.lengthOf("a😀")).toBe(2);
    expect(Values.lengthOf([1, 2, 3])).toBe(3);
    expect(Values.lengthOf(new Map([[1, 1]]))).toBe(1);
    expect(Values.lengthOf(new Set([1, 2]))).toBe(2);
    expect(Values.lengthOf({ a: 1, b: 2 })).toBe(2);
    expect(Values.lengthOf(new Uint8Array(4))).toBe(4);
    expect(Values.lengthOf(new ArrayBuffer(3))).toBe(3);
    expect(Values.lengthOf(5)).toBeNull();
    expect(Values.lengthOf(new Date())).toBeNull();
  });
});

describe("JsonText", () => {
  test("sorts keys by code point, integer-like keys included", () => {
    expect(JsonText.document({ b: 1, "10": 2, "2": 3 })).toBe(
      '{\n  "10": 2,\n  "2": 3,\n  "b": 1\n}\n',
    );
  });

  test("follows a shape's order and leaves values sorted", () => {
    const shape = { order: ["z", "a"], fields: { z: "value" as const } };
    expect(
      JsonText.document({ a: 1, z: { y: 1, x: 2 }, extra: 0 }, shape),
    ).toBe(
      '{\n  "z": {\n    "x": 2,\n    "y": 1\n  },\n  "a": 1,\n  "extra": 0\n}\n',
    );
  });

  test("writes empty containers, nulls and non-finite numbers", () => {
    expect(JsonText.document({ a: [], b: {}, c: null, d: undefined })).toBe(
      '{\n  "a": [],\n  "b": {},\n  "c": null\n}\n',
    );
    expect(JsonText.write(NaN, "value", 0)).toBe("null");
    expect(JsonText.write([1, "é"], { items: "value" }, 0)).toBe(
      '[\n  1,\n  "é"\n]',
    );
  });
});
