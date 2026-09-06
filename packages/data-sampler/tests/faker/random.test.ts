import { describe, expect, test } from "bun:test";

import { FakerRandom, Fakers } from "../../src/faker";

const draws = (seed: number, n: number): number[] => {
  const random = new FakerRandom(Fakers.seeded(seed));
  return Array.from({ length: n }, () => random.next());
};

describe("FakerRandom", () => {
  test("every draw is in [0, 1)", () => {
    for (const value of draws(3, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("the same seed gives the same first 20 values", () => {
    expect(draws(42, 20)).toEqual(draws(42, 20));
  });

  test("a different seed differs", () => {
    expect(draws(43, 20)).not.toEqual(draws(42, 20));
  });
});
