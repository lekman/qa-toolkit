import { defineConfig } from "vitest/config";

/**
 * vitest configuration for the conformance scenarios. The harness
 * (`run.ts`) passes the files, the pool and the worker count on the command
 * line, so one config serves every scenario.
 */
export default defineConfig({
  test: {
    include: ["conformance/vitest/*.qualify.ts"],
    globalSetup: ["@lekman/qualify/vitest/setup"],
    setupFiles: ["conformance/worker-log.ts"],
  },
});
