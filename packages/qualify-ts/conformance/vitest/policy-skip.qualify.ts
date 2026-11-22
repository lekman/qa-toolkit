import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-007",
  "policy-skip test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read-write",
  },
  (ctx) => {
    ctx.check("fixture", "one equals one").that(1).equals(1);
  },
);
