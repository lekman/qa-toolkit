/** A protocol or map file that cannot be used. `trace` exits 2. */
export class TraceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceInputError";
  }
}
