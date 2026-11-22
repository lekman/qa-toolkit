import { oq } from "@lekman/qualify/vitest";

// Lower case: the ID does not match the pattern.
oq(
  "OQ-conf-009",
  "bad-id test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.check("fixture", "one equals one").that(1).equals(1);
  },
);

// An IQ prefix declared with oq: the prefix does not match the level.
oq(
  "IQ-CONF-010",
  "bad-id test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.check("fixture", "one equals one").that(1).equals(1);
  },
);
