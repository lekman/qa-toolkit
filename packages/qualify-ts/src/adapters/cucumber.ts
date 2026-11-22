/**
 * The cucumber-js adapter. `install()`, called from a support file, adds
 * hooks that turn every scenario into a qualification test: the scenario
 * name is `<ID> <title>`, the steps are the narrative, and tags carry the
 * requirements, risk and scope. Steps record checks with `ctx(this)`.
 *
 * `install()` also sets cucumber's definition function wrapper, so a
 * `ctx.skip(reason)` in a step shows as a skipped step. In the main process
 * it sets `QUALIFY_RUN_ID` when it is not set, before cucumber-js starts its
 * parallel workers, so every worker shares one run ID.
 *
 * Runner glue only, covered by the conformance runs rather than unit tests.
 */

import {
  After,
  AfterStep,
  Before,
  BeforeStep,
  setDefinitionFunctionWrapper,
  version,
} from "@cucumber/cucumber";
import { resolve } from "node:path";

import type { QualifyContext } from "../checks";
import type { AdapterInfo, StartedTest } from "../execution";
import type { QualifyOptions } from "../settings";

import { SkipSignal } from "../checks";
import { Execution, Runtime, SystemDependencies } from "../execution";
import { Scenarios } from "../scenario";
import { ConfigurationError } from "../settings";
import { Site } from "../site";

/** Options for `install`. */
export interface CucumberOptions {
  /**
   * A cucumber tag expression, such as `@qualification`: only the scenarios
   * it selects are qualification tests. Default: every scenario.
   */
  tags?: string;
}

/** One running scenario: its started test and the step that is running. */
interface ScenarioState {
  /** Set once the record is written. */
  done: boolean;
  /** Absolute path of the feature file. */
  file: string;
  /** Where the first error happened: the running step, or `null` in a hook. */
  failureSite: null | string;
  /** Whether a step, rather than a hook, is running. */
  inStep: boolean;
  lines: Map<string, number>;
  started: StartedTest;
  /** The site of the running step. */
  step?: string;
  thrown?: { error: unknown };
}

const OWN_ROOT = Site.ownRoot(import.meta.url);
const STATE = Symbol.for("@lekman/qualify.cucumber");
const runtime = new Runtime(SystemDependencies.create());

const ADAPTER: AdapterInfo = {
  ownRoot: OWN_ROOT,
  runner: `cucumber-js ${version}`,
  runId: (env) => {
    const id = env.QUALIFY_RUN_ID;
    if (id === undefined || id.length === 0) {
      throw new ConfigurationError(
        "no run ID: call install() from @lekman/qualify/cucumber in a support file, or set QUALIFY_RUN_ID",
      );
    }
    return id;
  },
};

const stateOf = (world: unknown): ScenarioState | undefined =>
  typeof world === "object" && world !== null
    ? (world as Record<symbol, ScenarioState | undefined>)[STATE]
    : undefined;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/** The context of the qualification test running in a world: pass the step's `this`. */
export const ctx = (world: unknown): QualifyContext => {
  const state = stateOf(world);
  if (state === undefined || state.done) {
    throw new Error(
      "qualify: no qualification test is running in this world. Call install() from a support file, pass the step's `this` (a function, not an arrow function), and check the tags given to install()",
    );
  }
  return state.started.ctx;
};

/**
 * Wrap a step or hook function: keep the first error the scenario throws for
 * its record, redact it before cucumber prints it, and turn `ctx.skip` into a
 * skipped step. `install()` sets this as cucumber's definition function
 * wrapper; a project with a wrapper of its own calls it from that wrapper.
 */
export const wrap = <F extends (...args: never[]) => unknown>(code: F): F =>
  function (this: unknown, ...args: unknown[]): unknown {
    const fail = (error: unknown): "skipped" => {
      const state = stateOf(this);
      if (state !== undefined && !state.done) {
        Execution.redactError(error, state.started.process);
        if (state.thrown === undefined) {
          state.thrown = { error };
          state.failureSite = state.inStep ? (state.step ?? null) : null;
        }
      }
      if (SkipSignal.is(error)) return "skipped";
      throw error;
    };
    let result: unknown;
    try {
      result = (code as unknown as (...a: unknown[]) => unknown).apply(
        this,
        args,
      );
    } catch (error) {
      return fail(error);
    }
    return isThenable(result)
      ? Promise.resolve(result).then(undefined, fail)
      : result;
  } as unknown as F;

/** Add the hooks that make scenarios qualification tests. Call once, from a support file. */
export function install(options: CucumberOptions = {}): void {
  // The main process creates the run ID before cucumber-js starts its
  // workers; each worker copies the environment when it starts.
  const current = process.env.QUALIFY_RUN_ID;
  if (
    process.env.CUCUMBER_WORKER_ID === undefined &&
    (current === undefined || current.length === 0)
  ) {
    runtime.settings();
    process.env.QUALIFY_RUN_ID = runtime.createRunId();
  }
  const hook = options.tags === undefined ? {} : { tags: options.tags };

  setDefinitionFunctionWrapper(wrap);

  Before(
    { ...hook, name: "qualify: start the evidence record" },
    async function (this: object, { gherkinDocument, pickle }) {
      const declared = Scenarios.declaration(pickle);
      const sites = runtime.sites(OWN_ROOT);
      const file = resolve(process.cwd(), pickle.uri);
      const registration = Execution.declareAt(
        declared.level,
        declared.id,
        declared.title,
        declared.narrative,
        { path: file, line: declared.line },
        sites,
      );
      if (!registration.valid) throw registration.error;
      const context = runtime.process(ADAPTER);
      const { site } = registration.declared.declaration;
      // The overrides run only once steps run, after `state` is set.
      const started = await Execution.start(registration, context, {
        check: () => state.step ?? site,
        failure: () => state.failureSite,
      });
      const state: ScenarioState = {
        done: false,
        file,
        failureSite: null,
        inStep: false,
        lines: Scenarios.lines(gherkinDocument),
        started,
      };
      (this as Record<symbol, ScenarioState>)[STATE] = state;
      return started.policySkip === undefined ? undefined : "skipped";
    },
  );

  BeforeStep(hook, function (this: object, { pickleStep }) {
    const state = stateOf(this);
    if (state === undefined) return;
    const line = state.lines.get(pickleStep.astNodeIds[0] ?? "");
    state.inStep = true;
    state.step =
      line === undefined
        ? state.started.registration.declared.declaration.site
        : Site.format(
            { path: state.file, line },
            state.started.process.sites.root,
          );
  });

  AfterStep(hook, function (this: object) {
    const state = stateOf(this);
    if (state !== undefined) state.inStep = false;
  });

  After(
    { ...hook, name: "qualify: write the evidence record" },
    async function (this: object, { result }) {
      const state = stateOf(this);
      if (state === undefined || state.done) return;
      state.done = true;
      const thrown = state.thrown ?? Scenarios.ending(result);
      const ended = await Execution.end(
        state.started,
        thrown,
        Scenarios.RUNNER,
      );
      // A failure cucumber has not seen yet, such as a failed soft check or
      // delegated work that failed after its step, fails the scenario here.
      if (
        (ended.outcome === "fail" || ended.outcome === "error") &&
        result?.status === "PASSED"
      ) {
        throw ended.rethrow;
      }
    },
  );
}

/** Give settings in code, from a support file, before the first scenario runs. */
export const configure = (options: QualifyOptions): void =>
  runtime.configure(options);

export type { QualifyContext } from "../checks";
export type { NotApplicableRule, QualifyOptions } from "../settings";
