import type { Level } from "../declaration";
import type { JsonValue } from "../values";

/** What `ctx.attach` accepts as a body. */
export type AttachmentBody =
  ArrayBuffer | ArrayBufferView | boolean | null | number | object | string;

/** An attachment held in memory until the record is written and redacted. */
export type PendingAttachment =
  | { bytes: Uint8Array; contentType: string; filename: string; kind: "bytes" }
  | { contentType: string; filename: string; kind: "json"; value: JsonValue };

/** The values a matcher records. */
export interface MatchResult {
  actual: JsonValue;
  expected: JsonValue;
  pass: boolean;
}

/** The assertion half of a check: one matcher records and ends the check. */
export interface Assertion {
  /** A number is at least the bound. */
  atLeast(bound: bigint | number): boolean;
  /** A number is at most the bound. */
  atMost(bound: bigint | number): boolean;
  /** A string contains a substring, or a list contains an equal element. */
  contains(expected: unknown): boolean;
  /** Deep equality after normalisation. */
  equals(expected: unknown): boolean;
  /** A string, list or map has the given length. */
  hasLength(length: number): boolean;
  /** The value is boolean `false`. */
  isFalse(): boolean;
  /** The value is not null or undefined. */
  isNotNull(): boolean;
  /** The value is null or undefined. */
  isNull(): boolean;
  /** The value is boolean `true`. */
  isTrue(): boolean;
  /** A string matches a regular expression. */
  matches(pattern: RegExp | string): boolean;
  /** Not deep-equal. */
  notEquals(expected: unknown): boolean;
  /** The value equals one of the given values. */
  oneOf(values: readonly unknown[]): boolean;
}

/** A check that has a context and a description and waits for its value. */
export interface Check {
  /** Make the check soft: a failure is recorded and the test keeps going. */
  soft(): Check;
  /** The value under test. */
  that(actual: unknown): Assertion;
}

/** The one context object a qualification test receives. */
export interface QualifyContext {
  /** Add an inline attachment. JSON content types also accept objects. */
  attach(filename: string, body: AttachmentBody, contentType: string): void;
  /** Start a hard check. Add `.soft()` for a soft check. */
  check(context: string, description: string): Check;
  /** Run `fn` and record it as one check with matcher `delegate`. */
  delegate<T>(
    context: string,
    description: string,
    fn: () => Promise<T>,
  ): Promise<T>;
  /** Run `fn` and record it as one check with matcher `delegate`. */
  delegate<T>(context: string, description: string, fn: () => T): T;
  /** The environment the test runs in. */
  readonly environment: string;
  /** The test ID. */
  readonly id: string;
  /** The test level. */
  readonly level: Level;
  /** Register a value for redaction and return it unchanged. */
  redact<T extends string>(value: T): T;
  /** Attach `run-context.json`: the run's source, actor and target, plus `extra`. */
  runContext(extra?: Record<string, unknown>): void;
  /** Read a named secret (`QUALIFY_SECRET_<NAME>` by default) and register it. */
  secret(name: string): string;
  /** Skip the test at runtime. Ends the body. */
  skip(reason: string): never;
}
