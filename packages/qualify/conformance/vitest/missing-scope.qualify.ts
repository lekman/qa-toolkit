import { oq } from "@lekman/qualify/vitest";

// Declared without scope on purpose: an OQ test must declare it.
oq(
  "OQ-CONF-008",
  "missing-scope test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
  },
  (ctx) => {
    ctx.check("fixture", "one equals one").that(1).equals(1);
  },
);
