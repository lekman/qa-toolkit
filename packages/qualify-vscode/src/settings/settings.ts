import type { RunnerDefinition } from "../runners";
import type { PackageSettings, QualifySettings } from "./types";

/**
 * What discovery always skips, unless `qualify.exclude` takes a glob out
 * with `!`: build output and tool folders, and the fixtures and
 * conformance scenarios a test toolkit keeps for its own tests.
 */
const EXCLUDE: readonly string[] = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/bin/**",
  "**/obj/**",
  "**/target/**",
  "**/.venv/**",
  "**/.git/**",
  "**/.vscode-test/**",
  "**/conformance/**",
  "**/fixture/**",
  "**/fixtures/**",
  "**/test-host/**",
];

const DEFAULTS: QualifySettings = {
  enabled: true,
  evidenceDir: "qualification/evidence",
  exclude: [...EXCLUDE],
  gitIgnore: true,
  packages: {},
  runners: {},
  traceFiles: "**/{trace.md,trace.json}",
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v : undefined;

/** Only the entries whose values are strings that are not empty. */
const strings = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!isRecord(v)) return out;
  for (const [key, value] of Object.entries(v)) {
    const s = text(value);
    if (s !== undefined) out[key] = s;
  }
  return out;
};

/** Reads the `qualify.*` settings and picks the command and evidence folder for a package. */
export class Settings {
  /** The values a setting has when it is not set. */
  static readonly DEFAULTS: QualifySettings = DEFAULTS;

  /** The globs discovery skips when `qualify.exclude` is not set. */
  static readonly EXCLUDE: readonly string[] = EXCLUDE;

  /**
   * The command template for a runner in a package, most specific first:
   * the package's command for that runner, the package's command, the
   * runner's command for every package, then the definition's default.
   */
  static command(
    settings: QualifySettings,
    packagePath: string,
    definition: RunnerDefinition,
  ): string {
    const own = settings.packages[packagePath];
    return (
      own?.runners?.[definition.id] ??
      own?.command ??
      settings.runners[definition.id] ??
      definition.command
    );
  }

  /** The evidence folder of a package, relative to the package. */
  static evidenceDir(settings: QualifySettings, packagePath: string): string {
    return settings.packages[packagePath]?.evidenceDir ?? settings.evidenceDir;
  }

  /**
   * The built-in globs and the user's, merged: a user's glob adds to the
   * built-in ones, and a built-in glob given again after a `!` is taken out.
   */
  static exclude(user: readonly string[]): string[] {
    const removed = new Set(
      user.filter((g) => g.startsWith("!")).map((g) => g.slice(1).trim()),
    );
    const added = user
      .filter((g) => !g.startsWith("!"))
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    return [...new Set([...EXCLUDE.filter((g) => !removed.has(g)), ...added])];
  }

  /** Settings from raw configuration values, with a default for each value that is missing or of the wrong type. */
  static from(raw: Readonly<Record<string, unknown>>): QualifySettings {
    const packages: Record<string, PackageSettings> = {};
    if (isRecord(raw.packages)) {
      for (const [key, value] of Object.entries(raw.packages)) {
        if (!isRecord(value)) continue;
        const command = text(value.command);
        const evidenceDir = text(value.evidenceDir);
        const runners = strings(value.runners);
        const path = key
          .replace(/\\/g, "/")
          .replace(/^\.\/(?=.)/, "")
          .replace(/\/$/, "");
        packages[path.length === 0 ? "." : path] = {
          ...(command === undefined ? {} : { command }),
          ...(evidenceDir === undefined ? {} : { evidenceDir }),
          ...(Object.keys(runners).length === 0 ? {} : { runners }),
        };
      }
    }
    const exclude = Settings.exclude(
      Array.isArray(raw.exclude)
        ? raw.exclude.filter((e): e is string => typeof e === "string")
        : [],
    );
    return {
      enabled: raw.enabled !== false,
      evidenceDir: text(raw.evidenceDir) ?? DEFAULTS.evidenceDir,
      exclude,
      gitIgnore: raw.gitIgnore !== false,
      packages,
      runners: strings(raw.runners),
      traceFiles: text(raw.traceFiles) ?? DEFAULTS.traceFiles,
    };
  }
}
