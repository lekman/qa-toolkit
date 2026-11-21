/**
 * Global setup for `node --test` (Node 24 or later): it runs once in the main
 * process, before any test file's process starts. It checks the settings, so
 * a bad configuration fails the run at start, and sets `QUALIFY_RUN_ID` when
 * it is not set. Every test process inherits the variable, so the whole run
 * shares one ID.
 *
 * `--test-global-setup` takes a file path, not a package name, so re-export
 * it from a file in the project:
 *
 *   // qualify.setup.mjs
 *   export { globalSetup } from "@lekman/qualify/node/setup";
 *
 *   node --test --test-global-setup=qualify.setup.mjs
 *
 * A module loaded with `--import` does not work: Node loads it in each test
 * file's process and not in the main process, so each file would create its
 * own run ID.
 */

import { Runtime, SystemDependencies } from "../execution";

/** Check the settings and set `QUALIFY_RUN_ID` for every test process. */
export function globalSetup(): void {
  const runtime = new Runtime(SystemDependencies.create(), {});
  runtime.settings();
  const current = process.env.QUALIFY_RUN_ID;
  if (current === undefined || current.length === 0) {
    process.env.QUALIFY_RUN_ID = runtime.createRunId();
  }
}
