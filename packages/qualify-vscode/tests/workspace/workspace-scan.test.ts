import { describe, expect, test } from "bun:test";

import { Settings } from "../../src/settings";
import { TestTree } from "../../src/tree";
import { WorkspaceScan } from "../../src/workspace";
import { WorkspaceFilesMock } from "../mocks/fixtures";

const FILES: Record<string, string> = {
  "/ws/apps/web/features/support.feature": `@support
Feature: Support
  @REQ-SUPPORT-001 @risk-high
  Scenario: IU-SUPPORT-001 Support lists every ticket
    Given a
    When b
    Then c
`,
  "/ws/apps/web/node_modules/x/a.test.ts": `import { oq } from "@lekman/qualify/vitest";\noq("OQ-HIDDEN-001", "t", {}, () => {});`,
  "/ws/apps/web/package.json": "{}",
  "/ws/apps/web/src/export.test.ts": `import { oq, iq } from "@lekman/qualify/vitest";
oq("OQ-EXPORT-001", "Exports", { given: "g", when: "w", then: "t", scope: "read", requirements: ["EXPORT-001"] }, () => {});
iq("IQ-SETUP-001", "Starts", { given: "g", when: "w", then: "t" }, () => {});
oq("OQ-EXPORT-API-001", "Bad", { given: "g", when: "w", then: "t", scope: "read" }, () => {});
`,
  "/ws/bun.lock": "",
  "/ws/libs/py/pyproject.toml": "",
  "/ws/libs/py/tests/test_a.py": `import qualify
@qualify.pq("PQ-LOAD-001", "Holds the load", given="g", when="w", then="t", scope="read", risk="low")
def test_load(ctx): pass
`,
  "/ws/libs/py/tests/test_dup.py": `import qualify
@qualify.pq("PQ-LOAD-001", "Again", given="g", when="w", then="t", scope="read")
def test_again(ctx): pass
`,
  "/ws/README.md": "oq(",
};

describe("WorkspaceScan and TestTree", () => {
  test("builds product, package, level and test", async () => {
    const folder = { name: "ws", path: "/ws" };
    const scan = await WorkspaceScan.scan(
      folder,
      Settings.DEFAULTS,
      new WorkspaceFilesMock(FILES),
    );
    expect([...scan.declarations.keys()].sort()).toEqual([
      "/ws/apps/web/features/support.feature",
      "/ws/apps/web/src/export.test.ts",
      "/ws/libs/py/tests/test_a.py",
      "/ws/libs/py/tests/test_dup.py",
    ]);
    const product = WorkspaceScan.resolve(
      folder,
      scan.declarations,
      scan.index,
    );
    const tree = TestTree.build([product]);
    const shape = (nodes: typeof tree, depth = 0): string[] =>
      nodes.flatMap((n) => [
        `${"  ".repeat(depth)}${n.label}${n.description ? ` (${n.description})` : ""}${n.error ? " !" : ""}`,
        ...shape(n.children, depth + 1),
      ]);
    expect(shape(tree)).toEqual([
      "ws (6 tests)",
      "  apps/web (package.json · 4 tests)",
      "    IQ (Installation Qualification · 1 test)",
      "      IQ-SETUP-001 Starts",
      "    OQ (Operational Qualification · 2 tests)",
      "      OQ-EXPORT-001 Exports (EXPORT-001)",
      "      OQ-EXPORT-API-001 Bad !",
      "    IU (Intended Use · 1 test)",
      "      IU-SUPPORT-001 Support lists every ticket (REQ-SUPPORT-001 · risk high)",
      "  libs/py (pyproject.toml · 2 tests)",
      "    PQ (Performance Qualification · 2 tests)",
      "      PQ-LOAD-001 Holds the load (risk low) !",
      "      PQ-LOAD-001 Again !",
    ]);
    const iu = tree[0]?.children[0]?.children[2]?.children[0];
    expect(iu?.tags).toEqual([
      "level:iu",
      "req:REQ-SUPPORT-001",
      "risk:high",
      "runner:cucumber-js",
      "tag:support",
    ]);
    const ids = tree[0]?.children[1]?.children[0]?.children.map((n) => n.id);
    expect(new Set(ids).size).toBe(2);
  });

  test("index globs cover build and tool files", () => {
    expect(WorkspaceScan.indexGlobs()).toContain("**/*.csproj");
    expect(WorkspaceScan.indexGlobs()).toContain("**/bun.lock");
  });
});
