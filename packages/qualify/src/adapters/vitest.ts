/**
 * The vitest adapter: `iq`, `oq`, `pq` and `iu` register qualification tests
 * with vitest's own `test`. Add `@lekman/qualify/vitest/setup` to
 * `globalSetup` so every worker shares one run ID.
 *
 * Runner glue only, covered by the conformance runs rather than unit tests.
 */

import type { ProvidedContext, TestContext as VitestTestContext } from "vitest";

import { inject, test } from "vitest";

import type { Level, Narrative } from "../declaration";
import type { AdapterInfo, TestBody } from "../execution";
import type { RunnerErrors } from "../outcome";
import type { QualifyOptions } from "../settings";

import { Execution, Runtime, SystemDependencies } from "../execution";
import { ConfigurationError } from "../settings";
import { Site } from "../site";

declare module "vitest" {
  export interface ProvidedContext {
    /** Settings given in the vitest config under `test.provide.qualify`. */
    qualify: QualifyOptionsData;
    /** The run ID the global setup created or read from `QUALIFY_RUN_ID`. */
    qualifyRunId: string;
    /** The vitest version, read in the main process. */
    qualifyVitestVersion: string;
  }
}

/** The settings that can be given as data in the vitest config. */
export type QualifyOptionsData = Omit<
  QualifyOptions,
  "notApplicable" | "resolveEnvironment" | "secretSource"
> &
  Pick<QualifyOptions, "notApplicable">;

/** A qualification test body under vitest. */
export type VitestBody = TestBody<VitestTestContext>;

/** A level function: ID, title, narrative, body. */
export type LevelFunction = (
  id: string,
  title: string,
  narrative: Narrative,
  body: VitestBody,
) => void;

const OWN_ROOT = Site.ownRoot(import.meta.url);
const runtime = new Runtime(SystemDependencies.create());

const provided = <K extends keyof ProvidedContext & string>(
  key: K,
): ProvidedContext[K] | undefined => {
  try {
    return inject(key) as ProvidedContext[K] | undefined;
  } catch {
    return undefined;
  }
};

let configApplied = false;

const adapter = (): AdapterInfo => {
  if (!configApplied) {
    configApplied = true;
    const fromConfig = provided("qualify");
    if (fromConfig) runtime.configure({ ...fromConfig, ...runtime.options() });
  }
  return {
    ownRoot: OWN_ROOT,
    runner: `vitest ${provided("qualifyVitestVersion") ?? "unknown"}`,
    runId: (env) => {
      const id = provided("qualifyRunId") ?? env.QUALIFY_RUN_ID;
      if (id === undefined || id.length === 0) {
        throw new ConfigurationError(
          'no run ID: add "@lekman/qualify/vitest/setup" to globalSetup in the vitest config, or set QUALIFY_RUN_ID',
        );
      }
      return id;
    },
  };
};

const RUNNER: RunnerErrors = {
  isAssertion: () => false,
  skipReason: (error) => {
    if (typeof error !== "object" || error === null) return undefined;
    const pending = error as { code?: unknown; note?: unknown };
    if (pending.code !== "VITEST_PENDING") return undefined;
    return typeof pending.note === "string" && pending.note.length > 0
      ? pending.note
      : "skipped by vitest";
  },
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
    // vitest's own `test` only. An API from `test.extend` refuses this
    // wrapper, because vitest requires a fixture user to destructure the
    // fixtures by name, and the wrapper cannot know them.
    test(
      registration.name,
      async (context) => {
        const process = runtime.process(adapter());
        const result = await Execution.run(
          registration,
          body,
          context,
          process,
          RUNNER,
        );
        Execution.finish(result, (reason) => context.skip(reason));
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

/** Give settings in code, for example from a vitest setup file. */
export const configure = (options: QualifyOptions): void =>
  runtime.configure(options);

export type { QualifyContext } from "../checks";
export type { Narrative } from "../declaration";
export type { NotApplicableRule, QualifyOptions } from "../settings";
