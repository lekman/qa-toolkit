// A fixture of a test toolkit's own tests: it reuses ts-app's ID on purpose.
// Discovery skips fixtures/ folders, so ts-app's test shows no duplicate.
import { oq } from "@lekman/qualify/vitest";

oq(
  "OQ-EXPORT-003",
  "The bank file never changes an amount",
  { given: "g", when: "w", then: "t", scope: "read" },
  () => {},
);
