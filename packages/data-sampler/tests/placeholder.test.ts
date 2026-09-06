import { expect, test } from "bun:test";

// Gives the CI test loop something to run. Deleted in qat-002.
test("placeholder passes", () => {
  expect(true).toBe(true);
});
