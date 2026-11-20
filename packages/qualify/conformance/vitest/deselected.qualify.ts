import { oq } from "@lekman/qualify/vitest";

// The harness selects only OQ-CONF-020 with vitest's own name filter.
oq(
  "OQ-CONF-020",
  "deselected test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  () => {},
);

oq(
  "OQ-CONF-021",
  "deselected test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  () => {},
);
