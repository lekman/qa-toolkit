import type { PolicyOverride } from "../evidence";

/** A rule that skips matching tests as not applicable, with a reason. */
export interface NotApplicableRule {
  /** Matches when the environment is one of these. Omit to match any. */
  environments?: readonly string[];
  /** Recorded as the skip reason. */
  reason: string;
  /** Matches a test carrying any of these tags. Omit to match any test. */
  tags?: readonly string[];
}

/**
 * Settings a project gives in code or in its runner configuration. An
 * environment variable wins over the same setting given here.
 */
export interface QualifyOptions {
  /** `QUALIFY_ALLOW_WRITE`: `ID=reason` pairs separated by `;`, or a map. */
  allowWrite?: Readonly<Record<string, string>> | string;
  /** `QUALIFY_ATTACHMENT_LIMIT`, in bytes. Default 1 MiB. */
  attachmentLimit?: number;
  /** `QUALIFY_ENVIRONMENT`. Default `local`. */
  environment?: string;
  /** `QUALIFY_EVIDENCE_DIR`. Default `qualification/evidence`. */
  evidenceDir?: string;
  /** `QUALIFY_NO_OVERRIDES`: refuse every override. */
  noOverrides?: boolean;
  /** Rules that skip tests as not applicable. */
  notApplicable?: readonly NotApplicableRule[];
  /** `QUALIFY_PRODUCTION`: environment names treated as production. */
  production?: readonly string[] | string;
  /**
   * Replaces the default environment resolver. If it throws, the
   * environment is treated as `production`.
   */
  resolveEnvironment?: () => string;
  /** Replaces the default secret source, which reads `QUALIFY_SECRET_<NAME>`. */
  secretSource?: (name: string) => string | undefined;
}

/** Settings after resolving the environment variables and the options. */
export interface Settings {
  attachmentLimit: number;
  environment: string;
  evidenceDir: string;
  notApplicable: readonly NotApplicableRule[];
  overrides: PolicyOverride[];
  production: string[];
  productionWriteBlocked: boolean;
  readSecret: (name: string) => string | undefined;
}

/** Environment variables, as `process.env` holds them. */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;
