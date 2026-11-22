/** The folder a test belongs to: the nearest one with a build file. */
export interface PackageRoot {
  /** Names of the build files in the folder, such as `package.json`. */
  markers: string[];
  /** Absolute path of the folder. */
  root: string;
}

/** The files discovery found, by the folder that holds them. */
export type FileIndex = ReadonlyMap<string, readonly string[]>;
