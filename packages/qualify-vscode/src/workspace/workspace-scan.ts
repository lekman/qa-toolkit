import type { Declaration } from "../discovery";
import type { FileIndex } from "../packages";
import type { QualifySettings } from "../settings";
import type { IWorkspaceFiles } from "./interfaces";
import type { ProductFolder, ProductTests, ScanResult } from "./types";

import { DeclarationRules, Discovery } from "../discovery";
import { PackageRoots } from "../packages";
import { RunnerDefinitions } from "../runners";

/** Finds the tests of a product: reads its files, then places each test in its package. */
export class WorkspaceScan {
  /** The globs of the build files and tool files a scan indexes. */
  static indexGlobs(): string[] {
    return [...PackageRoots.GLOBS, ...RunnerDefinitions.toolFiles()].map(
      (name) => `**/${name}`,
    );
  }

  /**
   * Places each declaration in its package and picks its runner. A problem
   * is added to every declaration whose ID another one in the product uses.
   */
  static resolve(
    folder: ProductFolder,
    declarations: ReadonlyMap<string, readonly Declaration[]>,
    index: FileIndex,
  ): ProductTests {
    const all = [...declarations.keys()]
      .sort()
      .flatMap((file) => declarations.get(file) ?? []);
    const checked = DeclarationRules.duplicates(all);
    return {
      folder,
      tests: checked.map((declaration) => {
        const root = PackageRoots.nearest(declaration.file, folder.path, index);
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
    };
  }

  /** Reads every file of a product that may declare a test, and indexes its build files. */
  static async scan(
    folder: ProductFolder,
    settings: QualifySettings,
    files: IWorkspaceFiles,
  ): Promise<ScanResult> {
    const [sources, indexed] = await Promise.all([
      files.find(
        folder.path,
        RunnerDefinitions.sourceGlobs(),
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
    return { declarations, index: PackageRoots.index(indexed) };
  }
}
