/** Finds and reads the files of a workspace folder. */
export interface IWorkspaceFiles {
  /** Absolute paths of the files under `folder` that match a glob in `include` and none in `exclude`. */
  find(
    folder: string,
    include: readonly string[],
    exclude: readonly string[],
  ): Promise<string[]>;
  /** The text of a file, or `undefined` when it cannot be read. */
  read(path: string): Promise<string | undefined>;
}
