import { describe, expect, test } from "bun:test";

import { Dataset, Sampler, SpreadError } from "../../src/sampler";

interface Row {
  fromCtx: string;
  seen: string;
  value: number;
}

const rows = Dataset.define<Row>({
  fields: {
    fromCtx: { default: (ctx) => ctx.grade },
    seen: { default: (ctx) => `${ctx.record.fromCtx}/${ctx.index}` },
    value: { a: (ctx) => ctx.faker.number.int({ max: 9, min: 0 }), b: () => 100 },
  },
  grades: ["a", "b"],
  name: "rows",
  spread: { a: 0.9, b: 0.1 },
});

describe("Sampler", () => {
  test("counts per grade match the allocation exactly", () => {
    const run = Sampler.run(rows, { count: 100, seed: 1 });
    expect(run.allocation).toEqual({ a: 90, b: 10 });
    expect(run.records.filter((r) => r.grade === "a")).toHaveLength(90);
    expect(run.records.filter((r) => r.grade === "b")).toHaveLength(10);
  });

  test("each generator receives the record's grade", () => {
    for (const record of Sampler.run(rows, { count: 50, seed: 2 }).records) {
      expect(record.data.fromCtx).toBe(record.grade);
      expect(record.data.value).toBe(record.grade === "b" ? 100 : record.data.value);
      if (record.grade === "b") expect(record.data.value).toBe(100);
      else expect(record.data.value).toBeLessThan(10);
    }
  });

  test("a later field can read an earlier one through ctx.record", () => {
    for (const record of Sampler.run(rows, { count: 20, seed: 3 }).records) {
      expect(record.data.seen).toBe(`${record.grade}/${record.index}`);
    }
  });

  test("index runs 0..count-1 in yield order", () => {
    const indexes = [...Sampler.records(rows, { count: 10, seed: 4 })].map((r) => r.index);
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("the same seed is deep-equal and another seed differs", () => {
    const first = Sampler.run(rows, { count: 30, seed: 7 });
    const second = Sampler.run(rows, { count: 30, seed: 7 });
    const other = Sampler.run(rows, { count: 30, seed: 8 });
    expect(first).toEqual(second);
    expect(other).not.toEqual(first);
    expect(first.seed).toBe(7);
  });

  test("spread in options overrides the dataset default", () => {
    const run = Sampler.run(rows, { count: 10, seed: 1, spread: { a: 0.5, b: 0.5 } });
    expect(run.allocation).toEqual({ a: 5, b: 5 });
  });

  test("an invalid override spread is rejected", () => {
    expect(() => Sampler.run(rows, { count: 10, seed: 1, spread: { c: 1 } })).toThrow(SpreadError);
  });

  test("plan returns the allocation and the given seed without generating", () => {
    expect(Sampler.plan(rows, { count: 1000, seed: 99 })).toEqual({
      allocation: { a: 900, b: 100 },
      seed: 99,
    });
  });

  test("plan draws an integer seed when none is given", () => {
    const { seed } = Sampler.plan(rows, { count: 1 });
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  test("run without a seed reports the drawn seed and reproduces with it", () => {
    const drawn = Sampler.run(rows, { count: 5 });
    const replay = Sampler.run(rows, { count: 5, seed: drawn.seed });
    expect(replay.records).toEqual(drawn.records);
  });
});
