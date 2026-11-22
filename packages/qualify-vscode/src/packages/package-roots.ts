import { basename, dirname, relative } from "node:path";

import type { FileIndex, PackageRoot } from "./types";

const MARKERS: readonly string[] = [
  "package.json",
  "pyproject.toml",
  "setup.py",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
];

/**
 * Finds the package a file belongs to: the nearest folder, up to the
 * workspace folder, that holds `package.json`, `pyproject.toml`, `setup.py`,
 * a Gradle or Maven build, or a `.csproj`.
 */
export class PackageRoots {
  /** The build files that make a folder a package, as glob names. */
  static readonly GLOBS: readonly string[] = [...MARKERS, "*.csproj"];

  /**
   * The folder at or above `from`, up to `folder`, that holds a file named
   * `name`, or `undefined`.
   */
  static findUp(
    name: string,
    from: string,
    folder: string,
    index: FileIndex,
  ): string | undefined {
    for (const dir of PackageRoots.upwards(from, folder)) {
      if (index.get(dir)?.includes(name)) return dir;
    }
    return undefined;
  }

  /** The files by the folder that holds them. */
  static index(files: readonly string[]): FileIndex {
    const index = new Map<string, string[]>();
    for (const file of files) {
      const dir = dirname(file);
      index.set(dir, [...(index.get(dir) ?? []), basename(file)]);
    }
    return index;
  }

  /** Whether a file name makes its folder a package. */
  static isMarker(name: string): boolean {
    return MARKERS.includes(name) || name.endsWith(".csproj");
  }

  /** The package of a file; the workspace folder when no folder above it has a build file. */
  static nearest(file: string, folder: string, index: FileIndex): PackageRoot {
    for (const dir of PackageRoots.upwards(dirname(file), folder)) {
      const markers = (index.get(dir) ?? []).filter(PackageRoots.isMarker);
      if (markers.length > 0) {
        return { markers: [...markers].sort(), root: dir };
      }
    }
    return { markers: [], root: folder };
  }

  /** A package's path relative to its workspace folder, `.` for the folder itself, with `/`. */
  static relative(folder: string, root: string): string {
    const rel = relative(folder, root).split("\\").join("/");
    return rel.length === 0 ? "." : rel;
  }

  /** The folders from `from` up to `folder`, nearest first; only `from` when it is outside `folder`. */
  private static upwards(from: string, folder: string): string[] {
    const dirs: string[] = [];
    let dir = from;
    for (;;) {
      dirs.push(dir);
      const rel = relative(folder, dir);
      if (rel.length === 0 || rel.startsWith("..")) break;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return dirs;
  }
}
