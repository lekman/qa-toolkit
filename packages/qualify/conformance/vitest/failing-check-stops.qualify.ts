import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-002",
  "failing-check-stops test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.check("fixture", "first passes").that(1).equals(1);
    ctx.check("fixture", "second fails").that(2).equals(3);
    ctx.check("fixture", "third never runs").that(4).equals(4);
  },
);
