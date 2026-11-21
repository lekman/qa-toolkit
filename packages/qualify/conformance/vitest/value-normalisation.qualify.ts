import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-017",
  "value-normalisation test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    const bytes = new Uint8Array([0x01, 0x02]);
    const instant = new Date("2026-01-02T03:04:05.006Z");
    const big = 2 ** 60;
    const map = { b: 1, a: { d: 2, c: 3 } };
    const set = new Set(["b", "a"]);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    ctx.check("value", "bytes").that(bytes).equals(bytes);
    ctx.check("value", "instant").that(instant).equals(instant);
    ctx.check("value", "big integer").that(big).equals(big);
    ctx.check("value", "NaN").that(NaN).equals(NaN);
    ctx.check("value", "map").that(map).equals(map);
    ctx.check("value", "set").that(set).equals(set);
    ctx.check("value", "cycle").that(cycle).equals(cycle);
  },
);
