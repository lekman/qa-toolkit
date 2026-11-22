import type { ResolvedTest } from "../workspace";

/** What a node of the tree stands for. */
export type NodeKind = "level" | "package" | "product" | "test";

/** One node of the Testing view's tree, without the VS Code API. */
export interface TreeNode {
  children: TreeNode[];
  description?: string;
  /** Shown as an error on the item; the node is still listed. */
  error?: string;
  /** Absolute path of the file the node opens, if any. */
  file?: string;
  /** Unique in the tree, and the same across refreshes while the test keeps its ID. */
  id: string;
  kind: NodeKind;
  label: string;
  /** 1-based line in `file`. */
  line?: number;
  /** Sorts siblings. */
  sortText: string;
  /** Testing view tags, such as `risk:high`. */
  tags: string[];
  /** The test a `test` node stands for. */
  test?: ResolvedTest;
}
