import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-013",
  "several-requirements test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
    requirements: ["REQ-1", "REQ-2"],
  },
  () => {},
);
