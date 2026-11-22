/**
 * The bun adapter: `iq`, `oq`, `pq` and `iu` register qualification tests
 * with `bun:test`. `bun test` runs every file in one process, so the process
 * creates the run ID when `QUALIFY_RUN_ID` is not set.
 *
 * Runner glue only, covered by the conformance runs rather than unit tests.
 */

import { test } from "bun:test";

import type { Level, Narrative } from "../declaration";
import type { AdapterInfo, TestBody } from "../execution";
import type { RunnerErrors } from "../outcome";
import type { QualifyOptions } from "../settings";

import { Execution, Runtime, SystemDependencies } from "../execution";
import { Site } from "../site";

/** A qualification test body under bun. Bun passes no test context. */
export type BunBody = TestBody<undefined>;

/** A level function: ID, title, narrative, body. */
export type LevelFunction = (
  id: string,
  title: string,
  narrative: Narrative,
  body: BunBody,
) => void;

const OWN_ROOT = Site.ownRoot(import.meta.url);
const runtime = new Runtime(SystemDependencies.create());

const ADAPTER: AdapterInfo = {
  ownRoot: OWN_ROOT,
  runner: "bun test",
  runId: (env, create) => {
    const id = env.QUALIFY_RUN_ID;
    return id !== undefined && id.length > 0 ? id : create();
  },
};

const RUNNER: RunnerErrors = {
  // bun's expect() throws a plain Error whose message starts with "expect(".
  isAssertion: (error) =>
    error instanceof Error &&
    error.constructor === Error &&
    error.message.startsWith("expect("),
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
      test(registration.name, () => {
        throw error;
      });
      return;
    }
    // No parameter: bun treats a declared parameter as a `done` callback.
    test(
      registration.name,
      async () => {
        const process = runtime.process(ADAPTER);
        const result = await Execution.run(
          registration,
          body,
          undefined,
          process,
          RUNNER,
        );
        // bun has no skip from inside a running test: the record says skip
        // and bun reports the test as passed.
        Execution.finish(result, () => undefined);
      },
      registration.declared.timeoutMs,
    );
  };

/** Declare an Installation Qualification test. */
export const iq = make("IQ");
/** Declare an Operational Qualification test. */
export const oq = make("OQ");
/** Declare a Performance Qualification test. */
export const pq = make("PQ");
/** Declare an Intended Use test. */
export const iu = make("IU");

/** Give settings in code, for example from a file listed in `preload`. */
export const configure = (options: QualifyOptions): void =>
  runtime.configure(options);

export type { QualifyContext } from "../checks";
export type { Narrative } from "../declaration";
export type { NotApplicableRule, QualifyOptions } from "../settings";
