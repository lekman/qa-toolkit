import type { TestSet, TestSetFile } from "@lekman/test-sets";

import { RunnerDefinitions, TestSets } from "@lekman/test-sets";
import { basename, dirname, join, relative } from "node:path";

import type { QualifySettings } from "../settings";
import type {
  IWorkspaceFiles,
  ProductFolder,
  ResolvedTest,
} from "../workspace";

import { Discovery } from "../discovery";
import { OrdinaryTests } from "./ordinary-tests";

/** A path relative to a folder, with `/`. */
const rel = (from: string, to: string): string =>
  relative(from, to).split("\\").join("/");

/**
 * Finds the ordinary tests of the sets in `qa.yaml`: the sets whose level is
 * unit, story or integration. Qualification sets are found by discovery and
 * only lend their command and results folder.
 */
export class SetScan {
  /** The globs of a set's test files, relative to the product folder. */
  static globs(set: TestSet, runnerFiles: readonly string[]): string[] {
    const files = set.files ?? runnerFiles;
    return set.paths.flatMap((p) => {
      const path = TestSets.normalise(p);
      return files.map((g) => (path === "." ? g : `${path}/${g}`));
    });
  }

  /** The package folder of a file in a set: its nearest folder the set covers. */
  static packageOf(set: TestSet, file: string): string | undefined {
    let dir = dirname(file);
    for (;;) {
      if (TestSets.covers(set, dir)) return TestSets.normalise(dir);
      if (dir === "." || dir === "") return undefined;
      dir = dirname(dir);
    }
  }

  /** The ordinary tests of every set in the file, each as one test per case, or one per file when no case is found. */
  static async scan(
    folder: ProductFolder,
    file: TestSetFile,
    settings: QualifySettings,
    files: IWorkspaceFiles,
  ): Promise<ResolvedTest[]> {
    const found: ResolvedTest[] = [];
    for (const set of file.sets) {
      if (TestSets.isQualification(set.level)) continue;
      const runner = RunnerDefinitions.byId(set.runner);
      if (runner === undefined) continue;
      const paths = await files.find(
        folder.path,
        SetScan.globs(set, runner.files),
        settings.exclude,
      );
      for (const path of [...new Set(paths)].sort()) {
        const relFile = rel(folder.path, path);
        const pkg = SetScan.packageOf(set, relFile);
        if (pkg === undefined) continue;
        const text = (await files.read(path)) ?? "";
        const cases = OrdinaryTests.cases(path, text, runner.framework);
        const root = pkg === "." ? folder.path : join(folder.path, pkg);
        const inPackage = rel(root, path);
        for (const c of cases.length > 0
          ? cases
          : [{ line: 1, name: basename(path) }]) {
          found.push({
            declaration: {
              file: path,
              framework: runner.framework,
              id: `${inPackage}#${c.name}`,
              language: Discovery.languageOf(path) ?? "typescript",
              level: set.level,
              line: c.line,
              problems: [],
              requirements: [],
              tags: [],
              title: c.name,
            },
            folder,
            package: { markers: [], path: pkg, root },
            runner,
            set,
          });
        }
      }
    }
    return found;
  }
}
