import type { Classification, RunnerErrors } from "./types";

import { CheckFailed, SkipSignal } from "../checks";

/**
 * The type name of a thrown value: a `name` the error sets on itself, then
 * its class name, then an inherited `name`. The own `name` comes first because
 * a bundler may rename a class (AttachmentTooLarge2) when two chunks hold one.
 */
const typeName = (error: unknown): string => {
  if (error === null || error === undefined) return String(error);
  if (typeof error !== "object") return typeof error;
  const own = Object.prototype.hasOwnProperty.call(error, "name")
    ? (error as { name?: unknown }).name
    : undefined;
  if (typeof own === "string" && own.length > 0 && own !== "Error") return own;
  const ctor = (error as { constructor?: { name?: unknown } }).constructor
    ?.name;
  const name = (error as { name?: unknown }).name;
  if (
    typeof ctor === "string" &&
    ctor.length > 0 &&
    ctor !== "Error" &&
    ctor !== "Object"
  ) {
    return ctor;
  }
  if (typeof name === "string" && name.length > 0) return name;
  return typeof ctor === "string" && ctor.length > 0 ? ctor : "Error";
};

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
};

/** Assertion errors any TypeScript runner may throw. */
const isCommonAssertion = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; name?: unknown };
  return (
    e.name === "AssertionError" ||
    typeName(error) === "AssertionError" ||
    e.code === "ERR_ASSERTION"
  );
};

/** Outcome classification, section 3.3 of the specification. */
export class Outcomes {
  /**
   * Classify the end of a body: what it threw, if anything, and its failed
   * soft checks. A thrown value decides the outcome; failed soft checks only
   * decide it when the body completed.
   */
  static classify(
    thrown: undefined | { error: unknown },
    softFailures: number,
    runner: RunnerErrors,
  ): Classification {
    if (thrown === undefined) {
      if (softFailures > 0) {
        return {
          outcome: "fail",
          failure: {
            type: "CheckFailed",
            message: `${softFailures} soft check(s) failed`,
          },
        };
      }
      return { outcome: "pass" };
    }
    const { error } = thrown;
    if (SkipSignal.is(error))
      return { outcome: "skip", skipReason: error.reason };
    const runnerSkip = runner.skipReason(error);
    if (runnerSkip !== undefined)
      return { outcome: "skip", skipReason: runnerSkip };
    if (CheckFailed.is(error)) {
      return {
        outcome: "fail",
        failure: { type: "CheckFailed", message: error.message },
      };
    }
    const failure = { type: typeName(error), message: messageOf(error) };
    if (isCommonAssertion(error) || runner.isAssertion(error)) {
      return { outcome: "fail", failure };
    }
    return { outcome: "error", failure };
  }

  /** The type name recorded for a thrown value. */
  static typeName(error: unknown): string {
    return typeName(error);
  }
}
