/**
 * vitest global setup: runs once in the main process, before any worker
 * starts. It creates the run ID (or takes `QUALIFY_RUN_ID`), checks the
 * settings so a bad configuration fails the run at start, and provides both
 * to every worker.
 *
 *   // vitest.config.ts
 *   export default defineConfig({
 *     test: { globalSetup: ["@lekman/qualify/vitest/setup"] },
 *   });
 */

import type { TestProject } from "vitest/node";

import { version } from "vitest/node";

import { Runtime, SystemDependencies } from "../execution";

/** Create or read the run ID and provide it to the workers. */
export default function setup(project: TestProject): void {
  const runtime = new Runtime(SystemDependencies.create(), {});
  const fromConfig = project.getProvidedContext().qualify;
  if (fromConfig) runtime.configure(fromConfig);
  runtime.settings();
  const env = process.env.QUALIFY_RUN_ID;
  const runId =
    env !== undefined && env.length > 0 ? env : runtime.createRunId();
  process.env.QUALIFY_RUN_ID = runId;
  project.provide("qualifyRunId", runId);
  project.provide("qualifyVitestVersion", version);
}
