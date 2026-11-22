// A conformance scenario of a test toolkit: its ID is wrong on purpose.
// Discovery skips conformance/ folders, so it is not shown.
import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-conf-009",
  "bad-id test",
  { given: "g", when: "w", then: "t", scope: "read" },
  () => {},
);
