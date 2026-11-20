import { describe, expect, test } from "bun:test";
import { pathToFileURL } from "node:url";

import { Site } from "../../src/site";

const stack = [
  "Error: x",
  "    at Site.here (/repo/packages/qualify/src/site/site.ts:10:5)",
  "    at new Promise (<anonymous>)",
  "    at node:internal/process/task_queues:95:5",
  "    at run (/repo/node_modules/vitest/dist/x.js:1:1)",
  "    at async body (/repo/tests/a.test.ts:12:7)",
  "    at /repo/tests/b.test.ts:3",
  `    at ${pathToFileURL("/repo/tests/c.test.ts").href}?v=1:4:2`,
].join("\n");

describe("Site", () => {
  test("parses V8 and JavaScriptCore frames", () => {
    expect(Site.frames(stack)).toEqual([
      { path: "/repo/packages/qualify/src/site/site.ts", line: 10 },
      { path: "/repo/node_modules/vitest/dist/x.js", line: 1 },
      { path: "/repo/tests/a.test.ts", line: 12 },
      { path: "/repo/tests/b.test.ts", line: 3 },
      { path: "/repo/tests/c.test.ts", line: 4 },
    ]);
    expect(Site.frames(undefined)).toEqual([]);
  });

  test("the caller skips qualify's own code and node_modules", () => {
    expect(Site.caller(stack, ["/repo/packages/qualify/src"])).toEqual({
      path: "/repo/tests/a.test.ts",
      line: 12,
    });
  });

  test("the innermost frame in a file", () => {
    expect(Site.inFile(stack, "/repo/tests/b.test.ts")).toEqual({
      path: "/repo/tests/b.test.ts",
      line: 3,
    });
    expect(Site.inFile(stack, "/elsewhere.ts")).toBeUndefined();
  });

  test("formats relative to the root with forward slashes", () => {
    expect(
      Site.format({ path: "/repo/tests/a.test.ts", line: 12 }, "/repo"),
    ).toBe("tests/a.test.ts:12");
    expect(Site.format({ path: "/repo", line: 1 }, "/repo")).toBe("repo:1");
  });

  test("own root is the nearest src or dist folder", () => {
    expect(
      Site.ownRoot(pathToFileURL("/x/qualify/src/site/site.ts").href),
    ).toBe("/x/qualify/src");
    expect(Site.ownRoot(pathToFileURL("/x/qualify/dist/vitest.js").href)).toBe(
      "/x/qualify/dist",
    );
    expect(Site.ownRoot(pathToFileURL("/x/other/mod.js").href)).toBe(
      "/x/other",
    );
  });
});
