/** A dataset definition is invalid. Reported without a stack trace by the CLI. */
export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetError";
  }
}

/** A spread or allocation request is invalid. Reported without a stack trace by the CLI. */
export class SpreadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadError";
  }
}
