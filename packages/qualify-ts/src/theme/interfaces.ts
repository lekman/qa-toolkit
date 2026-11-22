/** What loading a theme reads. Implemented by the system layer. */
export interface IThemeFiles {
  /** The folder holding the bundled themes, one folder per theme. */
  bundledDir(): string;
  /** A file's bytes. Throws when it cannot be read. */
  readBytes(path: string): Promise<Uint8Array>;
}
