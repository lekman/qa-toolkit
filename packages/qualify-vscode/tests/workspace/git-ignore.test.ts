import { describe, expect, test } from "bun:test";

import { GitIgnore, Globs } from "../../src/workspace";

describe("GitIgnore", () => {
  test("turns names, folders and anchored paths into globs", () => {
    const text = [
      "# a comment",
      "",
      "node_modules/",
      "/docs/plans",
      "packages/*/dist/",
      "*.vsix",
      ".env.*",
      "!CLAUDE.md",
      "\\#literal",
      "{a,b}",
      "trailing   ",
    ].join("\n");
    expect(GitIgnore.globs("/ws", "/ws/.gitignore", text)).toEqual([
      "**/node_modules/**",
      "docs/plans",
      "docs/plans/**",
      "packages/*/dist/**",
      "**/*.vsix",
      "**/*.vsix/**",
      "**/.env.*",
      "**/.env.*/**",
      "**/trailing",
      "**/trailing/**",
    ]);
  });

  test("a nested .gitignore applies under its own folder", () => {
    expect(
      GitIgnore.globs("/ws", "/ws/repo/.gitignore", "out/\n/tmp\r\n"),
    ).toEqual(["repo/**/out/**", "repo/tmp", "repo/tmp/**"]);
  });

  test("a .gitignore outside the folder adds nothing", () => {
    expect(GitIgnore.globs("/ws", "/other/.gitignore", "out/")).toEqual([]);
  });
});

describe("Globs", () => {
  test("matches double star, star, question mark, braces and classes", () => {
    expect(Globs.matchesAny("a/b/dist/x.js", ["**/dist/**"])).toBe(true);
    expect(Globs.matchesAny("dist/x.js", ["**/dist/**"])).toBe(true);
    expect(Globs.matchesAny("src/x.ts", ["**/dist/**"])).toBe(false);
    expect(Globs.matchesAny("a/trace.md", ["**/{trace.md,trace.json}"])).toBe(
      true,
    );
    expect(Globs.matchesAny("v1/x", ["v?/*"])).toBe(true);
    expect(Globs.matchesAny("v1/x", ["v[0-9]/x"])).toBe(true);
    expect(Globs.matchesAny("va/x", ["v[!a]/x"])).toBe(false);
    expect(Globs.matchesAny("a.b", ["a[.b"])).toBe(false);
  });
});
