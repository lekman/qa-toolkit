import { describe, expect, test } from "bun:test";

import { FakerRandom, Fakers } from "../../src/faker";
import { Distribution } from "../../src/sampler";
import { ScriptedRandom } from "../mocks/random.mock";

describe("Distribution.band", () => {
  test("returns min for a draw of 0", () => {
    expect(Distribution.band(new ScriptedRandom([0]), 10, 20)).toBe(10);
  });

  test("stays below max for a draw near 1", () => {
    const value = Distribution.band(new ScriptedRandom([0.999999]), 10, 20);
    expect(value).toBeLessThan(20);
    expect(value).toBeGreaterThan(19.99);
  });
});

describe("Distribution.outside", () => {
  test("never lands inside [min, max] over 1000 seeded draws", () => {
    const random = new FakerRandom(Fakers.seeded(1));
    let low = 0;
    let high = 0;
    for (let i = 0; i < 1000; i += 1) {
      const value = Distribution.outside(random, 55, 95, { max: 180, min: 30 });
      expect(value >= 30 && value <= 180).toBe(true);
      expect(value >= 55 && value <= 95).toBe(false);
      if (value < 55) low += 1;
      else high += 1;
    }
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
  });

  test("uses the only side that has width", () => {
    const value = Distribution.outside(new ScriptedRandom([0.5]), 0, 10, { max: 20, min: 0 });
    expect(value).toBeGreaterThan(10);
    expect(value).toBeLessThanOrEqual(20);
  });

  test("throws when neither side has width", () => {
    expect(() => Distribution.outside(new ScriptedRandom([0.5]), 0, 10, { max: 10, min: 0 })).toThrow(
      RangeError,
    );
  });
});

describe("Distribution.normal", () => {
  test("has mean 0 and sd 1 within tolerance over 10,000 seeded draws", () => {
    const random = new FakerRandom(Fakers.seeded(1));
    const n = 10_000;
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < n; i += 1) {
      const value = Distribution.normal(random, 0, 1);
      sum += value;
      sumSquares += value * value;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSquares / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(sd - 1)).toBeLessThan(0.05);
  });

  test("stays finite for a draw of 0", () => {
    expect(Number.isFinite(Distribution.normal(new ScriptedRandom([0, 0]), 5, 2))).toBe(true);
  });
});

describe("Distribution.integer", () => {
  test("is inclusive at both ends", () => {
    const random = new ScriptedRandom([0, 0.999999]);
    expect(Distribution.integer(random, 3, 7)).toBe(3);
    expect(Distribution.integer(random, 3, 7)).toBe(7);
  });
});

describe("Distribution.clamp", () => {
  test("clamps both tails and leaves the middle alone", () => {
    expect(Distribution.clamp(-1, 0, 10)).toBe(0);
    expect(Distribution.clamp(11, 0, 10)).toBe(10);
    expect(Distribution.clamp(5, 0, 10)).toBe(5);
  });
});
