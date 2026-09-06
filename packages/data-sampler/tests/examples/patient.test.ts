import { Sampler } from "@lekman/data-sampler";
import { describe, expect, test } from "bun:test";

import patient, { isPlausible } from "../../examples/patient";

describe("examples/patient", () => {
  const run = Sampler.run(patient, { count: 200, seed: 7 });

  test("yields the default allocation for 200 records", () => {
    expect(run.allocation).toEqual({ ill: 20, impossible: 10, normal: 140, warning: 30 });
  });

  test("every normal record has a resting heart rate and is plausible", () => {
    const normals = run.records.filter((r) => r.grade === "normal");
    expect(normals).toHaveLength(140);
    for (const { data } of normals) {
      expect(data.heartRate).toBeGreaterThanOrEqual(55);
      expect(data.heartRate).toBeLessThanOrEqual(95);
      expect(isPlausible(data)).toBe(true);
    }
  });

  test("every warning and ill record is plausible", () => {
    for (const { data, grade } of run.records) {
      if (grade === "warning" || grade === "ill") expect(isPlausible(data)).toBe(true);
    }
  });

  test("every impossible record is implausible", () => {
    const impossibles = run.records.filter((r) => r.grade === "impossible");
    expect(impossibles).toHaveLength(10);
    for (const { data } of impossibles) expect(isPlausible(data)).toBe(false);
  });

  test("the first record is byte-for-byte what seed 7 produced when this was written", () => {
    // Determinism guard. A change here after a faker upgrade is expected:
    // regenerate and say so in the commit body. A change with no dependency
    // change means something consumed the random stream in a new order.
    expect(run.records[0]).toEqual({
    data: {
      id: "9c0bf94a-ba2f-4f69-b0fd-ac34391e771a",
      givenName: "Porter",
      familyName: "McClure",
      age: 39,
      heartRate: 65,
      systolicBp: 122,
      temperatureC: 36.9,
      spo2: 100,
      admittedAt: "2026-08-04T23:31:48.657Z",
      dischargedAt: "2026-08-14T00:40:17.627Z",
    },
    grade: "normal",
    index: 0,
  });
  });
});
