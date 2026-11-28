/** A JUnit or LCOV input that cannot be imported. `import junit` exits 2. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}
