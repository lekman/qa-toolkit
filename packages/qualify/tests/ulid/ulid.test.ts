import { describe, expect, test } from "bun:test";

import { Ulid } from "../../src/ulid";

describe("Ulid", () => {
  test("encodes time and randomness in Crockford base32", () => {
    expect(Ulid.create(0, new Uint8Array(10))).toBe(
      "00000000000000000000000000",
    );
    expect(Ulid.create(2 ** 48 - 1, new Uint8Array(10).fill(255))).toBe(
      "7ZZZZZZZZZZZZZZZZZZZZZZZZZ",
    );
    const id = Ulid.create(Date.UTC(2026, 10, 20), new Uint8Array(10).fill(1));
    expect(Ulid.isValid(id)).toBe(true);
    expect(
      id.slice(0, 10) <
        Ulid.create(Date.UTC(2026, 10, 21), new Uint8Array(10)).slice(0, 10),
    ).toBe(true);
  });

  test("rejects bad input", () => {
    expect(() => Ulid.create(-1, new Uint8Array(10))).toThrow(RangeError);
    expect(() => Ulid.create(0, new Uint8Array(9))).toThrow(RangeError);
    expect(Ulid.isValid("01HQA1ZQJ0C0NF0RMANCE00000")).toBe(true);
    expect(Ulid.isValid("01HQA1ZQJ0C0NF0RMANCE0000I")).toBe(false);
    expect(Ulid.isValid(5)).toBe(false);
  });
});
