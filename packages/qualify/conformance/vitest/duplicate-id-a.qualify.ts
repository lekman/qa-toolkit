import { oq } from "@lekman/qualify/vitest";

// duplicate-id-a and duplicate-id-b both declare OQ-CONF-018.
oq(
  "OQ-CONF-018",
  "duplicate-id test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  () => {},
);
