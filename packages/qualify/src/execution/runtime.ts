import { isAbsolute, resolve } from "node:path";

import type { ISecretRegistry } from "../checks";
import type { GitFacts } from "../envelope";
import type { QualifyOptions } from "../settings";
import type { AdapterInfo, IRuntimeDependencies } from "./interfaces";
import type { ProcessContext, SiteContext } from "./types";

import pkg from "../../package.json" with { type: "json" };
import { SecretRegistry } from "../checks";
import { Envelope } from "../envelope";
import { ConfigurationError, Policy, SettingsResolver } from "../settings";
import { Ulid } from "../ulid";

/** Process-wide state, kept on `globalThis` so every copy of the module shares it. */
interface SharedState {
  git?: GitFacts;
  options: QualifyOptions;
  process?: { context?: ProcessContext; error?: unknown; key: string };
  registry: ISecretRegistry;
}

const STATE = Symbol.for("@lekman/qualify.state");

/**
 * The composition root an adapter uses: options, the secret registry, and
 * the process context, built once per process from its dependencies.
 */
export class Runtime {
  /** The package name recorded in `run.tool.name`. */
  static readonly TOOL_NAME = pkg.name;
  /** The package version recorded in `run.tool.version`. */
  static readonly TOOL_VERSION = pkg.version;
  private readonly deps: IRuntimeDependencies;
  private readonly holder: Record<symbol, SharedState | undefined>;

  constructor(deps: IRuntimeDependencies, holder: object = globalThis) {
    this.deps = deps;
    this.holder = holder as Record<symbol, SharedState | undefined>;
  }

  /**
   * Give settings in code, for example from a setup file. Environment
   * variables still win. Call before the first test runs.
   */
  configure(options: QualifyOptions): void {
    const state = this.state();
    state.options = { ...state.options, ...options };
    state.process = undefined;
  }

  /** Create a new run ID. */
  createRunId(): string {
    return Ulid.create(this.deps.now().getTime(), this.deps.random(10));
  }

  /** The options given so far. */
  options(): QualifyOptions {
    return this.state().options;
  }

  /**
   * The process context for an adapter, built on first use. A configuration
   * error is kept and thrown again for every later test.
   */
  process(adapter: AdapterInfo): ProcessContext {
    const state = this.state();
    const key = adapter.runner;
    if (state.process?.key !== key) {
      try {
        state.process = { key, context: this.build(adapter) };
      } catch (error) {
        state.process = { key, error };
      }
    }
    if (state.process.error !== undefined) throw state.process.error;
    return state.process.context as ProcessContext;
  }

  /** Throw away the cached process context. Options are kept. */
  reset(): void {
    this.state().process = undefined;
  }

  /** Validate the settings without building anything, for an early failure. */
  settings(): ReturnType<typeof SettingsResolver.resolve> {
    return SettingsResolver.resolve(this.deps.env, this.state().options);
  }

  /** Where sites point: the repository root, or the working directory. */
  sites(ownRoot: string): SiteContext {
    return { root: this.git().root ?? this.deps.cwd(), exclude: [ownRoot] };
  }

  private build(adapter: AdapterInfo): ProcessContext {
    const settings = this.settings();
    const runId = adapter.runId(this.deps.env, () => this.createRunId());
    if (!Ulid.isValid(runId)) {
      throw new ConfigurationError(`run ID ${runId} is not a ULID`);
    }
    const envelope = Envelope.build({
      env: this.deps.env,
      environment: settings.environment,
      git: this.git(),
      policy: Policy.info(settings),
      runId,
      tool: {
        name: Runtime.TOOL_NAME,
        version: Runtime.TOOL_VERSION,
        language: "typescript",
        runtime: `${this.deps.runtime()}; ${adapter.runner}`,
      },
    });
    const cwd = this.deps.cwd();
    return {
      envelope,
      evidenceDir: isAbsolute(settings.evidenceDir)
        ? settings.evidenceDir
        : resolve(cwd, settings.evidenceDir),
      now: () => this.deps.now(),
      registry: this.state().registry,
      settings,
      sites: this.sites(adapter.ownRoot),
      warn: (message) => this.deps.warn(message),
      writer: this.deps.writer,
    };
  }

  private git(): GitFacts {
    const state = this.state();
    state.git ??= this.deps.git.read(this.deps.cwd());
    return state.git;
  }

  private state(): SharedState {
    let state = this.holder[STATE];
    if (state === undefined) {
      state = { options: {}, registry: new SecretRegistry() };
      this.holder[STATE] = state;
    }
    return state;
  }
}
