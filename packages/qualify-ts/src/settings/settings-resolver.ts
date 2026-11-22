import type { PolicyOverride } from "../evidence";
import type { EnvironmentVariables, QualifyOptions, Settings } from "./types";

import { Declarations } from "../declaration";
import { EvidenceFiles } from "../evidence";
import { ConfigurationError } from "./errors";

const DEFAULT_LIMIT = 1024 * 1024;
const DEFAULT_PRODUCTION = ["production", "prod"];

const set = (value: string | undefined): string | undefined =>
  value === undefined || value.trim().length === 0 ? undefined : value;

const list = (value: readonly string[] | string): string[] =>
  (typeof value === "string" ? value.split(",") : [...value])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const flag = (value: string): boolean =>
  ["1", "true", "yes"].includes(value.trim().toLowerCase());

/**
 * Resolves settings from environment variables and project options, as
 * section 5 of the specification defines them. Pure: the caller passes the
 * variables in.
 */
export class SettingsResolver {
  /** The attachment size limit used when none is set. */
  static readonly DEFAULT_ATTACHMENT_LIMIT = DEFAULT_LIMIT;

  /**
   * The environment name. A configured resolver replaces the default; if it
   * throws or returns nothing, the environment is `production`.
   */
  static environment(
    env: EnvironmentVariables,
    options: QualifyOptions = {},
  ): string {
    if (options.resolveEnvironment) {
      try {
        const name = options.resolveEnvironment();
        return typeof name === "string" && name.trim().length > 0
          ? name.trim()
          : "production";
      } catch {
        return "production";
      }
    }
    return (
      set(env.QUALIFY_ENVIRONMENT)?.trim() ??
      set(options.environment)?.trim() ??
      "local"
    );
  }

  /**
   * Parse `QUALIFY_ALLOW_WRITE`: `ID=reason` pairs separated by `;`. Each ID
   * must be a valid test ID and each reason non-empty.
   */
  static overrides(
    value: Readonly<Record<string, string>> | string,
  ): PolicyOverride[] {
    const pairs: [string, string][] =
      typeof value === "string"
        ? value
            .split(";")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .map((entry) => {
              const at = entry.indexOf("=");
              return at < 0
                ? [entry, ""]
                : [entry.slice(0, at).trim(), entry.slice(at + 1).trim()];
            })
        : Object.entries(value).map(([id, reason]) => [
            id.trim(),
            reason.trim(),
          ]);
    const seen = new Set<string>();
    return pairs.map(([id, reason]) => {
      if (!Declarations.isTestId(id)) {
        throw new ConfigurationError(
          `QUALIFY_ALLOW_WRITE names ${id}, which is not a test ID`,
        );
      }
      if (reason.length === 0) {
        throw new ConfigurationError(
          `QUALIFY_ALLOW_WRITE gives no reason for ${id}; write ${id}=<reason>`,
        );
      }
      if (seen.has(id)) {
        throw new ConfigurationError(`QUALIFY_ALLOW_WRITE names ${id} twice`);
      }
      seen.add(id);
      return { id, reason };
    });
  }

  /** Resolve every setting. Invalid settings throw `ConfigurationError`. */
  static resolve(
    env: EnvironmentVariables,
    options: QualifyOptions = {},
  ): Settings {
    const environment = SettingsResolver.environment(env, options);
    const productionValue = set(env.QUALIFY_PRODUCTION) ?? options.production;
    const production =
      productionValue === undefined
        ? DEFAULT_PRODUCTION
        : list(productionValue);

    const allowWrite = set(env.QUALIFY_ALLOW_WRITE) ?? options.allowWrite;
    const overrides =
      allowWrite === undefined ? [] : SettingsResolver.overrides(allowWrite);
    const noOverridesValue = set(env.QUALIFY_NO_OVERRIDES);
    const noOverrides =
      noOverridesValue === undefined
        ? options.noOverrides === true
        : flag(noOverridesValue);
    if (noOverrides && overrides.length > 0) {
      throw new ConfigurationError(
        `QUALIFY_NO_OVERRIDES refuses every override, and QUALIFY_ALLOW_WRITE gives ${overrides.map((o) => o.id).join(", ")}`,
      );
    }

    const secretSource =
      options.secretSource ?? ((name: string) => env[`QUALIFY_SECRET_${name}`]);

    return {
      attachmentLimit: SettingsResolver.limit(
        set(env.QUALIFY_ATTACHMENT_LIMIT) ?? options.attachmentLimit,
      ),
      environment,
      evidenceDir:
        set(env.QUALIFY_EVIDENCE_DIR) ??
        set(options.evidenceDir) ??
        EvidenceFiles.DEFAULT_DIR,
      notApplicable: options.notApplicable ?? [],
      overrides,
      production,
      productionWriteBlocked: production.includes(environment),
      readSecret: secretSource,
    };
  }

  private static limit(value: number | string | undefined): number {
    if (value === undefined) return DEFAULT_LIMIT;
    const limit = typeof value === "number" ? value : Number(value.trim());
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new ConfigurationError(
        `QUALIFY_ATTACHMENT_LIMIT must be a whole number of bytes, got ${String(value)}`,
      );
    }
    return limit;
  }
}
