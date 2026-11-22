/** Settings for one package, keyed in `qualify.packages` by its folder. */
export interface PackageSettings {
  /** The command for every runner in the package. */
  command?: string;
  /** Where the package's tests write evidence, relative to the package. */
  evidenceDir?: string;
  /** A command per runner ID. */
  runners?: Record<string, string>;
}

/** The `qualify.*` settings of one workspace folder. */
export interface QualifySettings {
  /** Whether the extension reads this folder at all. */
  enabled: boolean;
  /** Where tests write evidence, relative to their package. */
  evidenceDir: string;
  /** Globs that discovery skips: the built-in ones and the user's, merged. */
  exclude: string[];
  /** Whether discovery also skips what each `.gitignore` in the folder ignores. */
  gitIgnore: boolean;
  /** Settings per package folder, relative to the workspace folder. */
  packages: Record<string, PackageSettings>;
  /** A command per runner ID, for every package. */
  runners: Record<string, string>;
  /** Where the trace command looks for `qualify trace` output. */
  traceFiles: string;
}
