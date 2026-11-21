import { oq } from "@lekman/qualify/vitest";
import { assert } from "vitest";

/** A helper shared with unit tests, using the runner's own assertion. */
function sharedHelper(): void {
  assert.fail("helper failed");
}

oq(
  "OQ-CONF-005",
  "plain-assertion test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.delegate("helper", "shared helper passes", sharedHelper);
  },
);
