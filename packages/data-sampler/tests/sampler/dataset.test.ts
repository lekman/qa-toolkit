import { describe, expect, test } from "bun:test";

import type { DatasetDefinition } from "../../src/sampler";

import { Dataset, DatasetError, defineDataset } from "../../src/sampler";

interface Row {
  label: string;
  value: number;
}

const valid: DatasetDefinition<Row> = {
  fields: {
    label: { default: (ctx) => ctx.grade },
    value: { a: () => 1, b: () => 2 },
  },
  grades: ["a", "b"],
  name: "rows",
  spread: { a: 0.5, b: 0.5 },
};

describe("Dataset.define", () => {
  test("accepts a definition with a default fallback and freezes it", () => {
    const defined = Dataset.define(valid);
    expect(Object.isFrozen(defined)).toBe(true);
    expect(Object.isFrozen(defined.grades)).toBe(true);
    expect(Object.isFrozen(defined.fields)).toBe(true);
    expect(Object.isFrozen(defined.fields.label)).toBe(true);
    expect(defined.spread).toEqual({ a: 0.5, b: 0.5 });
  });

  test("defineDataset is the same function", () => {
    expect(defineDataset).toBe(Dataset.define);
  });

  test("scales a percentage spread", () => {
    expect(Dataset.define({ ...valid, spread: { a: 90, b: 10 } }).spread).toEqual({ a: 0.9, b: 0.1 });
  });

  test("rejects an empty name", () => {
    expect(() => Dataset.define({ ...valid, name: " " })).toThrow(DatasetError);
  });

  test("rejects empty grades", () => {
    expect(() => Dataset.define({ ...valid, grades: [], spread: {} })).toThrow(/no grades/);
  });

  test("rejects duplicate grades", () => {
    expect(() => Dataset.define({ ...valid, grades: ["a", "a"] })).toThrow(/twice/);
  });

  test('rejects a grade named "default"', () => {
    expect(() =>
      Dataset.define({ ...valid, grades: ["a", "default"], spread: { a: 0.5, default: 0.5 } }),
    ).toThrow(/default/);
  });

  test("rejects a spread key outside the scale", () => {
    expect(() => Dataset.define({ ...valid, spread: { a: 0.5, c: 0.5 } })).toThrow(DatasetError);
  });

  test("rejects weights that do not sum to 1", () => {
    expect(() => Dataset.define({ ...valid, spread: { a: 0.5, b: 0.4 } })).toThrow(/sum to 1/);
  });

  test("rejects a field with no generator for a grade and no default", () => {
    const fields = { ...valid.fields, value: { a: () => 1 } };
    expect(() => Dataset.define({ ...valid, fields })).toThrow(/grade "b"/);
  });

  test("rejects a field that is not an object", () => {
    const fields = { ...valid.fields, value: null } as unknown as DatasetDefinition<Row>["fields"];
    expect(() => Dataset.define({ ...valid, fields })).toThrow(/no generators/);
  });

  test("rejects missing fields", () => {
    const fields = null as unknown as DatasetDefinition<Row>["fields"];
    expect(() => Dataset.define({ ...valid, fields })).toThrow(/no fields/);
  });
});
