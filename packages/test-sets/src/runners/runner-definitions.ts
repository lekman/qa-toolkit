import type { Framework, RunnerDefinition } from "./types";

import bunTest from "../../runners/bun-test.json";
import cucumberJs from "../../runners/cucumber-js.json";
import dotnet from "../../runners/dotnet.json";
import gradle from "../../runners/gradle.json";
import maven from "../../runners/maven.json";
import nodeTest from "../../runners/node-test.json";
import playwright from "../../runners/playwright.json";
import pytest from "../../runners/pytest.json";
import storybook from "../../runners/storybook.json";
import vitest from "../../runners/vitest.json";

const DEFINITIONS = [
  vitest,
  nodeTest,
  bunTest,
  cucumberJs,
  pytest,
  gradle,
  maven,
  dotnet,
  storybook,
  playwright,
] as unknown as readonly RunnerDefinition[];

/** The runner definitions in `runners/`, and which one runs a framework's tests. */
export class RunnerDefinitions {
  /** Every definition. */
  static readonly ALL: readonly RunnerDefinition[] = DEFINITIONS;

  /** A definition by its ID. */
  static byId(id: string): RunnerDefinition | undefined {
    return DEFINITIONS.find((d) => d.id === id);
  }

  /**
   * The runner for a framework in a package: the definition whose package
   * markers the package has, or the first one for the framework.
   */
  static forFramework(
    framework: Framework,
    markers: readonly string[],
  ): RunnerDefinition {
    const candidates = DEFINITIONS.filter((d) => d.framework === framework);
    const marked = candidates.find((d) =>
      d.packageMarkers?.some((m) => markers.includes(m)),
    );
    return (marked ?? candidates[0]) as RunnerDefinition;
  }

  /**
   * Globs of every file that may hold a test; with `qualify`, only of the
   * runners that have a qualify adapter.
   */
  static sourceGlobs(options: { qualify?: boolean } = {}): string[] {
    const definitions =
      options.qualify === true
        ? DEFINITIONS.filter((d) => d.qualify === true)
        : DEFINITIONS;
    return [...new Set(definitions.flatMap((d) => d.files))];
  }

  /** The names of the files that `${tool}` looks for, such as `gradlew`. */
  static toolFiles(): string[] {
    const names = DEFINITIONS.flatMap((d) =>
      d.tools.flatMap((t) => (t.file === undefined ? [] : [t.file])),
    );
    return [...new Set(names)].sort();
  }
}
