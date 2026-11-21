import type { Outcome } from "../evidence";

/** How the runner reports its own assertion errors and in-body skips. */
export interface RunnerErrors {
  /** Whether a thrown value is the runner's assertion error. */
  isAssertion(error: unknown): boolean;
  /** The reason when a thrown value is the runner's own skip, else `undefined`. */
  skipReason(error: unknown): string | undefined;
}

/** The outcome of a finished body, before redaction. */
export interface Classification {
  /** Type and message of the first failure, for `fail` and `error`. */
  failure?: { message: string; type: string };
  outcome: Outcome;
  /** Why the test was skipped, for `skip`. */
  skipReason?: string;
}
