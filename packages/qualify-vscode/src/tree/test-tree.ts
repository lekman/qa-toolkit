import type { Declaration } from "../discovery";
import type { ProductTests, ResolvedTest } from "../workspace";
import type { TreeNode } from "./types";

import { Levels } from "../levels";

/** Groups items by a key, keeping the first-seen order of the keys. */
const group = <T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
};

const bySort = (a: TreeNode, b: TreeNode): number =>
  a.sortText < b.sortText ? -1 : a.sortText > b.sortText ? 1 : 0;

/**
 * Builds the Testing view's tree: product (workspace folder), then package,
 * then level (IQ, OQ, PQ, IU), then test, labelled `<ID> <title>`.
 */
export class TestTree {
  /** The tree for every product. */
  static build(products: readonly ProductTests[]): TreeNode[] {
    return products
      .map((product): TreeNode => {
        const packages = group(product.tests, (t) => t.package.path);
        const children = [...packages.entries()].map(([path, tests]) =>
          TestTree.packageNode(product.folder.path, path, tests),
        );
        return {
          children: children.sort(bySort),
          description: TestTree.count(product.tests.length),
          id: `product:${product.folder.path}`,
          kind: "product",
          label: product.folder.name,
          sortText: product.folder.name,
          tags: [],
        };
      })
      .sort(bySort);
  }

  /** The description of a test: requirements, then risk. */
  static describe(d: Declaration): string {
    const parts: string[] = [];
    if (d.requirements.length > 0) parts.push(d.requirements.join(", "));
    if (d.risk !== undefined) parts.push(`risk ${d.risk}`);
    return parts.join(" · ");
  }

  /** The Testing view tags of a test: `level:`, `risk:`, `req:`, `tag:` and `runner:`. */
  static tags(test: ResolvedTest): string[] {
    const d = test.declaration;
    const tags = [
      `level:${d.level.toLowerCase()}`,
      `runner:${test.runner.id}`,
      ...d.requirements.map((r) => `req:${r}`),
      ...d.tags.map((t) => `tag:${t}`),
    ];
    if (d.risk !== undefined) tags.push(`risk:${d.risk}`);
    if (d.problems.length > 0) tags.push("error");
    return [...new Set(tags)].sort();
  }

  private static count(n: number): string {
    return n === 1 ? "1 test" : `${n} tests`;
  }

  private static packageNode(
    product: string,
    path: string,
    tests: readonly ResolvedTest[],
  ): TreeNode {
    const first = tests[0] as ResolvedTest;
    const levels = group(tests, (t) => t.declaration.level);
    const id = `package:${product}:${path}`;
    const children = [...levels.entries()].map(([level, members]): TreeNode => {
      const info = Levels.info(members[0]?.declaration.level ?? "unit");
      return {
        children: TestTree.testNodes(`${id}:${level}`, members),
        description: `${info.description} · ${TestTree.count(members.length)}`,
        id: `${id}:${level}`,
        kind: "level",
        label: level,
        sortText: String(info.order),
        tags: [],
      };
    });
    return {
      children: children.sort(bySort),
      description: [
        first.package.markers.join(", "),
        TestTree.count(tests.length),
      ]
        .filter((p) => p.length > 0)
        .join(" · "),
      file: first.package.root,
      id,
      kind: "package",
      label: path,
      sortText: path === "." ? "" : path,
      tags: [],
    };
  }

  private static testNodes(
    parent: string,
    tests: readonly ResolvedTest[],
  ): TreeNode[] {
    const seen = new Map<string, number>();
    return tests
      .map((test): TreeNode => {
        const d = test.declaration;
        const count = (seen.get(d.id) ?? 0) + 1;
        seen.set(d.id, count);
        const description = TestTree.describe(d);
        return {
          children: [],
          ...(description.length > 0 ? { description } : {}),
          ...(d.problems.length > 0 ? { error: d.problems.join("; ") } : {}),
          file: d.file,
          id:
            count === 1
              ? `${parent}:${d.id}`
              : `${parent}:${d.id}@${d.file}:${d.line}`,
          kind: "test",
          label: d.title.length > 0 ? `${d.id} ${d.title}` : d.id,
          line: d.line,
          sortText: `${d.id}\u0000${d.file}:${String(d.line).padStart(8, "0")}`,
          tags: TestTree.tags(test),
          test,
        };
      })
      .sort(bySort);
  }
}
