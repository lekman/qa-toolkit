import type { TestSet, TestSetFile } from "@lekman/test-sets";

import type { Declaration } from "../discovery";
import type { FileIndex, PackageRoot } from "../packages";
import type { RunnerDefinition } from "../runners";

/** A workspace folder: one product in the tree. */
export interface ProductFolder {
  name: string;
  /** Absolute path. */
  path: string;
}

/** A package of a product, with its path relative to the product folder. */
export interface ProductPackage extends PackageRoot {
  /** Relative to the product folder, with `/`; `.` for the folder itself. */
  path: string;
}

/** A declaration with the product, package and runner it belongs to. */
export interface ResolvedTest {
  declaration: Declaration;
  folder: ProductFolder;
  package: ProductPackage;
  runner: RunnerDefinition;
  /** The `qa.yaml` set an ordinary test belongs to; qualification tests have none. */
  set?: TestSet;
}

/** Every test of one product. */
export interface ProductTests {
  folder: ProductFolder;
  tests: ResolvedTest[];
}

/** What a scan of one product found. */
export interface ScanResult {
  /** Declarations by file, for re-reading one file when it changes. */
  declarations: Map<string, Declaration[]>;
  /** Build files and tool files, by folder. */
  index: FileIndex;
  /** The ordinary tests of the sets in `qa.yaml`. */
  ordinary: ResolvedTest[];
  /** What is wrong with `qa.yaml`, when it cannot be used. */
  problems: string[];
  /** The sets of `qa.yaml` at the product folder's root, when there is one. */
  sets?: TestSetFile;
}
