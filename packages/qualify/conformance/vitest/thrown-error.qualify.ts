import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-004",
  "thrown-error test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.check("fixture", "one equals one").that(1).equals(1);
    throw new Error("boom");
  },
);
