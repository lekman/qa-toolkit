/** A theme that cannot be used: invalid, incomplete, or with an unknown token. Exit 2. */
export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}
