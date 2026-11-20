/**
 * The `node:test` adapter: `iq`, `oq`, `pq` and `iu` register qualification
 * tests with `node:test`. `node --test` runs each file in its own process, so
 * the run shares one ID through `QUALIFY_RUN_ID`: set it in the job, or let
 * the global setup in `@lekman/qualify/node/setup` set it (Node 24 or later).
 * In one process (`--test-isolation=none`), the process creates the ID.
 *
 * Runner glue only, covered by the conformance runs rather than unit tests.
 */

import type { TestContext as NodeTestContext } from "node:test";

import { test } from "node:test";

import type { Level, Narrative } from "../declaration";
import type { AdapterInfo, TestBody } from "../execution";
import type { RunnerErrors } from "../outcome";
import type { QualifyOptions } from "../settings";

import { Execution, Runtime, SystemDependencies } from "../execution";
import { ConfigurationError } from "../settings";
import { Site } from "../site";

/** A qualification test body under `node:test`. */
export type NodeBody = TestBody<NodeTestContext>;

/** A level function: ID, title, narrative, body. */
export type LevelFunction = (
  id: string,
  title: string,
  narrative: Narrative,
  body: NodeBody,
) => void;

const OWN_ROOT = Site.ownRoot(import.meta.url);
const runtime = new Runtime(SystemDependencies.create());

const ADAPTER: AdapterInfo = {
  ownRoot: OWN_ROOT,
  runner: "node:test",
  runId: (env, create) => {
    const id = env.QUALIFY_RUN_ID;
    if (id !== undefined && id.length > 0) return id;
    if (env.NODE_TEST_CONTEXT !== undefined) {
      throw new ConfigurationError(
        "no run ID: node --test runs each file in its own process; set QUALIFY_RUN_ID, use --test-global-setup with @lekman/qualify/node/setup (Node 24 or later), or run in one process with --test-isolation=none",
      );
    }
    return create();
  },
};

const RUNNER: RunnerErrors = {
  isAssertion: () => false,
  skipReason: () => undefined,
};

const make =
  (level: Level): LevelFunction =>
  (id, title, narrative, body) => {
    const registration = Execution.declare(
      level,
      id,
      title,
      narrative,
      new Error().stack,
      runtime.sites(OWN_ROOT),
    );
    if (!registration.valid) {
      const { error } = registration;
      void test(registration.name, () => {
        throw error;
      });
      return;
    }
    const options =
      registration.declared.timeoutMs === undefined
        ? {}
        : { timeout: registration.declared.timeoutMs };
    void test(registration.name, options, async (t) => {
      const process = runtime.process(ADAPTER);
      const result = await Execution.run(
        registration,
        body,
        t,
        process,
        RUNNER,
      );
      Execution.finish(result, (reason) => t.skip(reason));
    });
  };

/** Declare an Installation Qualification test. */
export const iq = make("IQ");
/** Declare an Operational Qualification test. */
export const oq = make("OQ");
/** Declare a Performance Qualification test. */
export const pq = make("PQ");
/** Declare an Intended Use test. */
export const iu = make("IU");

/** Give settings in code, for example from a module loaded with `--import`. */
export const configure = (options: QualifyOptions): void =>
  runtime.configure(options);

export type { QualifyContext } from "../checks";
export type { Narrative } from "../declaration";
export type { NotApplicableRule, QualifyOptions } from "../settings";
