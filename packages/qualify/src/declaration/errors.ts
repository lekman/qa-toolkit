/**
 * A test declared with missing or invalid fields. It fails the test at
 * registration and no evidence is written for it.
 */
export class DeclarationError extends Error {
  /** Each problem found, in the order the fields were checked. */
  readonly problems: readonly string[];
  /** The ID as written, which may itself be the problem. */
  readonly testId: string;

  constructor(testId: string, problems: readonly string[]) {
    super(`qualify declaration ${testId}: ${problems.join("; ")}`);
    this.name = "DeclarationError";
    this.problems = problems;
    this.testId = testId;
  }
}
