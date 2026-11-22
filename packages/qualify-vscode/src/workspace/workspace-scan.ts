import { TestSets } from "@lekman/test-sets";
import { basename, join } from "node:path";

import type { Declaration } from "../discovery";
import type { FileIndex } from "../packages";
import type { QualifySettings } from "../settings";
import type { IWorkspaceFiles } from "./interfaces";
import type {
  ProductFolder,
  ProductTests,
  ResolvedTest,
  ScanResult,
} from "./types";

import { DeclarationRules, Discovery } from "../discovery";
import { PackageRoots } from "../packages";
import { RunnerDefinitions } from "../runners";
import { SetScan } from "../sets";

/** Finds the tests of a product: reads its files, then places each test in its package. */
export class WorkspaceScan {
  /** The globs of the build files and tool files a scan indexes. */
  static indexGlobs(): string[] {
    return [
      ...PackageRoots.GLOBS,
      ...RunnerDefinitions.toolFiles(),
      TestSets.FILE,
    ].map((name) => `**/${name}`);
  }

  /**
   * The ordinary tests that are not also qualification tests: a set's runner
   * also finds the qualification tests in its files, such as the `test_`
   * function under a qualify decorator, a scenario named with an ID, or a
   * file that holds only qualification tests.
   */
  static ordinaryOnly(
    ordinary: readonly ResolvedTest[],
    qualification: readonly Declaration[],
  ): ResolvedTest[] {
    return ordinary.filter((t) => {
      const d = t.declaration;
      return !qualification.some(
        (q) =>
          q.file === d.file &&
          (q.method === d.title ||
            d.title === q.id ||
            d.title.startsWith(`${q.id} `) ||
            d.title === basename(d.file)),
      );
    });
  }

  /**
   * Places each declaration in its package and picks its runner. A problem
   * is added to every declaration whose ID another one in the product uses.
   */
  static resolve(
    folder: ProductFolder,
    declarations: ReadonlyMap<string, readonly Declaration[]>,
    index: FileIndex,
    ordinary: readonly ResolvedTest[] = [],
  ): ProductTests {
    const all = [...declarations.keys()]
      .sort()
      .flatMap((file) => declarations.get(file) ?? []);
    const checked = DeclarationRules.duplicates(all);
    return {
      folder,
      tests: [
        ...checked.map((declaration): ResolvedTest => {
          const root = PackageRoots.nearest(
            declaration.file,
            folder.path,
            index,
          );
          return {
            declaration,
            folder,
            package: {
              ...root,
              path: PackageRoots.relative(folder.path, root.root),
            },
            runner: RunnerDefinitions.forFramework(
              declaration.framework,
              root.markers,
            ),
          };
        }),
        ...WorkspaceScan.ordinaryOnly(ordinary, all),
      ],
    };
  }

  /**
   * Reads every file of a product that may declare a qualification test,
   * indexes its build files, and reads the ordinary tests of the sets in
   * `qa.yaml` at its root.
   */
  static async scan(
    folder: ProductFolder,
    settings: QualifySettings,
    files: IWorkspaceFiles,
  ): Promise<ScanResult> {
    const [sources, indexed] = await Promise.all([
      files.find(
        folder.path,
        RunnerDefinitions.sourceGlobs({ qualify: true }),
        settings.exclude,
      ),
      files.find(folder.path, WorkspaceScan.indexGlobs(), settings.exclude),
    ]);
    const declarations = new Map<string, Declaration[]>();
    await Promise.all(
      [...new Set(sources)].map(async (file) => {
        const text = await files.read(file);
        if (text === undefined) return;
        const found = Discovery.parse(file, text);
        if (found.length > 0) declarations.set(file, found);
      }),
    );
    const text = await files.read(join(folder.path, TestSets.FILE));
    if (text === undefined) {
      return {
        declarations,
        index: PackageRoots.index(indexed),
        ordinary: [],
        problems: [],
      };
    }
    const parsed = TestSets.parse(text);
    const ordinary =
      parsed.file === undefined
        ? []
        : await SetScan.scan(folder, parsed.file, settings, files);
    return {
      declarations,
      index: PackageRoots.index(indexed),
      ordinary,
      problems: parsed.problems,
      ...(parsed.file === undefined ? {} : { sets: parsed.file }),
    };
  }
}
