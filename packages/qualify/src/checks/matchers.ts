import type { MatcherName } from "../evidence";
import type { MatchResult } from "./types";

import { Values } from "../values";

const isNumber = (value: unknown): value is bigint | number =>
  (typeof value === "number" && !Number.isNaN(value)) ||
  typeof value === "bigint";

const compareNumbers = (a: bigint | number, b: bigint | number): number => {
  if (typeof a === "bigint" || typeof b === "bigint") {
    if (typeof a === "number" && !Number.isFinite(a)) return a > 0 ? 1 : -1;
    if (typeof b === "number" && !Number.isFinite(b)) return b > 0 ? -1 : 1;
    const x = typeof a === "bigint" ? a : BigInt(Math.trunc(a));
    const y = typeof b === "bigint" ? b : BigInt(Math.trunc(b));
    if (x !== y) return x < y ? -1 : 1;
    const fa = typeof a === "number" ? a - Math.trunc(a) : 0;
    const fb = typeof b === "number" ? b - Math.trunc(b) : 0;
    return fa === fb ? 0 : fa < fb ? -1 : 1;
  }
  return a === b ? 0 : a < b ? -1 : 1;
};

const elements = (value: unknown): unknown[] | undefined => {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  return undefined;
};

const pattern = (value: RegExp | string): RegExp => {
  if (typeof value === "string") return new RegExp(value);
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags.replace(/[gy]/g, ""));
  }
  throw new TypeError("matches() takes a regular expression or a string");
};

/**
 * The matchers of section 3.2, as pure functions from the value under test
 * and the matcher's argument to what the check records.
 */
export class Matchers {
  /** Evaluate one matcher. Invalid arguments throw a `TypeError`. */
  static evaluate(
    matcher: Exclude<MatcherName, "delegate">,
    actual: unknown,
    argument?: unknown,
  ): MatchResult {
    const normalised = Values.normalise(actual);
    switch (matcher) {
      case "atLeast":
      case "atMost": {
        if (!isNumber(argument)) {
          throw new TypeError(`${matcher}() takes a number`);
        }
        const pass =
          isNumber(actual) &&
          (matcher === "atLeast"
            ? compareNumbers(actual, argument) >= 0
            : compareNumbers(actual, argument) <= 0);
        return {
          expected: Values.normalise(argument),
          actual: normalised,
          pass,
        };
      }
      case "contains": {
        const pass =
          typeof actual === "string" && typeof argument === "string"
            ? actual.includes(argument)
            : (elements(actual) ?? []).some((item) =>
                Values.equal(item, argument),
              );
        return {
          expected: Values.normalise(argument),
          actual: normalised,
          pass,
        };
      }
      case "equals":
      case "notEquals": {
        const equal = Values.equal(actual, argument);
        return {
          expected: Values.normalise(argument),
          actual: normalised,
          pass: matcher === "equals" ? equal : !equal,
        };
      }
      case "hasLength": {
        if (
          typeof argument !== "number" ||
          !Number.isInteger(argument) ||
          argument < 0
        ) {
          throw new TypeError("hasLength() takes a non-negative integer");
        }
        const length = Values.lengthOf(actual);
        return {
          expected: argument,
          actual: length,
          pass: length === argument,
        };
      }
      case "isFalse":
        return { expected: false, actual: normalised, pass: actual === false };
      case "isNotNull":
        return {
          expected: "not null",
          actual: normalised,
          pass: actual !== null && actual !== undefined,
        };
      case "isNull":
        return {
          expected: null,
          actual: normalised,
          pass: actual === null || actual === undefined,
        };
      case "isTrue":
        return { expected: true, actual: normalised, pass: actual === true };
      case "matches": {
        const regex = pattern(argument as RegExp | string);
        return {
          expected: regex.source,
          actual: normalised,
          pass: typeof actual === "string" && regex.test(actual),
        };
      }
      case "oneOf": {
        if (!Array.isArray(argument)) {
          throw new TypeError("oneOf() takes a list of values");
        }
        return {
          expected: Values.normalise(argument),
          actual: normalised,
          pass: argument.some((item) => Values.equal(actual, item)),
        };
      }
    }
  }
}
