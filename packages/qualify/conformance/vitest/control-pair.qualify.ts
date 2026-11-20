import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-CONF-022",
  "an unsigned call is refused",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  () => {},
);

oq(
  "OQ-CONF-023",
  "a signed call is accepted",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
    controls: "OQ-CONF-022",
  },
  () => {},
);
