import type { ResultFormat, TestSetFile } from "@lekman/test-sets";

import type { FileIndex } from "../packages";
import type { RunnerDefinition } from "../runners";
import type { QualifySettings } from "../settings";
import type { ResolvedTest } from "../workspace";

/** One command to run, and the tests whose results it leaves. */
export interface RunGroup {
  command: string;
  /** Absolute path the command runs in: the package folder. */
  cwd: string;
  /** Variables added to the environment: the evidence folder and the run ID. */
  env: Record<string, string>;
  /** Absolute path of the evidence folder of qualification tests; empty for ordinary tests. */
  evidenceDir: string;
  format: ResultFormat;
  /** Absolute path of the results: the evidence folder, the JUnit XML file, or a glob of JUnit files. */
  results: string;
  runner: RunnerDefinition;
  tests: ResolvedTest[];
}

/** A test that is not run, and why. */
export interface RefusedTest {
  reason: string;
  test: ResolvedTest;
}

/** What a run will do: the commands, and the tests it will not run. */
export interface RunPlanResult {
  groups: RunGroup[];
  refused: RefusedTest[];
}

/** What a plan needs to know about each product. */
export interface PlanContext {
  /** The build and tool files of a product folder. */
  index(folder: string): FileIndex;
  /** `process.platform`, for quoting. */
  platform: string;
  /** Absolute path of a folder for this extension's JUnit reports. */
  resultsDir: string;
  runId: string;
  /** The `qa.yaml` sets of a product folder, when it has the file. */
  sets(folder: string): TestSetFile | undefined;
  /** The settings of a product folder. */
  settings(folder: string): QualifySettings;
}
