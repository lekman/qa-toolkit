import { describe, expect, test } from "bun:test";

import type { SampledRecord } from "../../src/sampler";

import { Ndjson } from "../../src/output";

const records: SampledRecord<{ name: string; n: number }>[] = [
  { data: { n: 1, name: "one" }, grade: "a", index: 0 },
  { data: { n: 2, name: "two" }, grade: "b", index: 1 },
];

describe("Ndjson.line", () => {
  test("one object per line, newline terminated, _meta first", () => {
    const line = Ndjson.line(records[0] as SampledRecord<{ name: string; n: number }>, {
      meta: true,
      seed: 7,
    });
    expect(line.endsWith("\n")).toBe(true);
    expect(line.split("\n")).toHaveLength(2);
    const parsed = JSON.parse(line);
    expect(Object.keys(parsed)[0]).toBe("_meta");
    expect(parsed._meta).toEqual({ grade: "a", index: 0, seed: 7 });
    expect(parsed.name).toBe("one");
  });

  test("omits _meta when meta is false", () => {
    const parsed = JSON.parse(
      Ndjson.line(records[1] as SampledRecord<{ name: string; n: number }>, { meta: false, seed: 7 }),
    );
    expect(parsed).toEqual({ n: 2, name: "two" });
  });
});

describe("Ndjson.document", () => {
  test("parses back to an array of the same length", () => {
    const text = Ndjson.document(records, { meta: true, seed: 3 });
    expect(text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]._meta).toEqual({ grade: "b", index: 1, seed: 3 });
  });

  test("is pretty-printed with two spaces", () => {
    expect(Ndjson.document(records, { meta: false, seed: 3 })).toContain('\n  {\n    "n": 1');
  });
});
