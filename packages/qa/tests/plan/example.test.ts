import { TestSets } from "@lekman/test-sets";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("the example qa.yaml is valid", () => {
  const text = readFileSync(
    join(import.meta.dir, "../../examples/qa.yaml"),
    "utf8",
  );
  expect(TestSets.parse(text).problems).toEqual([]);
});
