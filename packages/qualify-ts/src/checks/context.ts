import type { CheckRecord } from "../evidence";
import type { JsonObject, JsonValue } from "../values";
import type { ContextSettings } from "./interfaces";
import type {
  Assertion,
  AttachmentBody,
  Check,
  MatchResult,
  PendingAttachment,
  QualifyContext,
} from "./types";

import { Redaction } from "../redaction";
import { JsonText, Values } from "../values";
import {
  AttachmentTooLarge,
  CheckFailed,
  SecretNotFound,
  SkipSignal,
} from "./errors";
import { Matchers } from "./matchers";

const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FILENAME = /^[^/\\]+$/;

const isJsonType = (contentType: string): boolean =>
  /^application\/json\s*(;|$)/i.test(contentType.trim());

const isBinary = (body: unknown): body is ArrayBuffer | ArrayBufferView =>
  body instanceof ArrayBuffer || ArrayBuffer.isView(body);

const toBytes = (body: ArrayBuffer | ArrayBufferView): Uint8Array =>
  body instanceof ArrayBuffer
    ? new Uint8Array(body)
    : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);

const nonEmpty = (value: unknown, what: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${what} must be a non-empty string`);
  }
  return value;
};

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * The context a qualification test receives. It records checks and
 * attachments in memory; the execution redacts and writes them when the body
 * ends.
 */
export class TestContext implements QualifyContext {
  /** The environment the test runs in. */
  readonly environment: string;
  /** The test ID. */
  readonly id: string;
  /** The test level. */
  readonly level: QualifyContext["level"];
  private readonly attached: PendingAttachment[] = [];
  private readonly pending: Promise<unknown>[] = [];
  private readonly recorded: CheckRecord[] = [];
  private readonly secrets = new Set<string>();
  private seq = 0;
  private readonly settings: ContextSettings;

  constructor(settings: ContextSettings) {
    this.settings = settings;
    this.environment = settings.environment;
    this.id = settings.id;
    this.level = settings.level;
  }

  private static pendingAttachment(
    filename: string,
    body: AttachmentBody,
    contentType: string,
  ): PendingAttachment {
    const json = isJsonType(contentType);
    if (typeof body === "string" || isBinary(body)) {
      const bytes =
        typeof body === "string"
          ? new Uint8Array(Buffer.from(body, "utf8"))
          : new Uint8Array(toBytes(body));
      if (json) {
        try {
          const text = Buffer.from(bytes).toString("utf8");
          const value = JSON.parse(text) as JsonValue;
          return {
            kind: "json",
            filename,
            contentType,
            value: Values.normalise(value),
          };
        } catch {
          // Not valid JSON: keep the bytes as given.
        }
      }
      return { kind: "bytes", filename, contentType, bytes };
    }
    if (!json) {
      throw new TypeError(
        `attachment ${filename}: only application/json takes an object body; pass a string or bytes`,
      );
    }
    return {
      kind: "json",
      filename,
      contentType,
      value: Values.normalise(body),
    };
  }

  /** Add an inline attachment, ending the test if it is over the limit. */
  attach(filename: string, body: AttachmentBody, contentType: string): void {
    nonEmpty(filename, "attachment filename");
    if (!FILENAME.test(filename)) {
      throw new TypeError(
        `attachment filename ${filename} must not contain / or \\`,
      );
    }
    nonEmpty(contentType, "attachment content type");
    const pending = TestContext.pendingAttachment(filename, body, contentType);
    const size =
      pending.kind === "bytes"
        ? pending.bytes.byteLength
        : Buffer.byteLength(JsonText.document(pending.value), "utf8");
    if (size > this.settings.attachmentLimit) {
      throw new AttachmentTooLarge(
        `attachment ${filename} is ${size} bytes, over the limit of ${this.settings.attachmentLimit} bytes`,
      );
    }
    this.attached.push(pending);
  }

  /** Attachments added so far, not yet redacted. */
  attachments(): readonly PendingAttachment[] {
    return this.attached;
  }

  /** Start a hard check. */
  check(context: string, description: string): Check {
    nonEmpty(context, "check context");
    nonEmpty(description, "check description");
    return this.builder(context, description, false);
  }

  /** Checks recorded so far, in call order. */
  checks(): readonly CheckRecord[] {
    return [...this.recorded].sort((a, b) => a.seq - b.seq);
  }

  /** Run `fn` and record it as one `delegate` check. */
  delegate<T>(context: string, description: string, fn: () => T): T {
    nonEmpty(context, "delegate context");
    nonEmpty(description, "delegate description");
    if (typeof fn !== "function") {
      throw new TypeError("delegate() takes a function to run");
    }
    const seq = this.seq++;
    const site = this.settings.site();
    const name = fn.name.length > 0 ? fn.name : "anonymous";
    const finish = (failure?: { error: unknown }): void => {
      this.recorded.push({
        seq,
        context,
        description,
        matcher: "delegate",
        expected: "completes",
        actual: failure ? failureMessage(failure.error) : "completed",
        pass: failure === undefined,
        soft: false,
        site,
        delegate: name,
        at: this.settings.now().toISOString(),
      });
    };
    let result: T;
    try {
      result = fn();
    } catch (error) {
      finish({ error });
      throw error;
    }
    if (!isThenable(result)) {
      finish();
      return result;
    }
    const settled = Promise.resolve(result).then(
      (value) => {
        finish();
        return value;
      },
      (error: unknown) => {
        finish({ error });
        throw error;
      },
    );
    this.pending.push(settled);
    return settled as T;
  }

  /** Register a value for redaction and return it unchanged. */
  redact<T extends string>(value: T): T {
    if (typeof value !== "string") {
      throw new TypeError("redact() takes a string");
    }
    if (!this.settings.registry.add(value)) {
      this.settings.warn(
        `qualify: ${this.id}: a value shorter than ${Redaction.MIN_LENGTH} characters was not registered for redaction`,
      );
    }
    return value;
  }

  /** Attach `run-context.json`. */
  runContext(extra: Record<string, unknown> = {}): void {
    const { actor, source, target } = this.settings.runContext();
    const values: JsonObject = {};
    for (const [key, value] of Object.entries(extra)) {
      values[key] = value === undefined ? null : Values.normalise(value);
    }
    const document: JsonObject = {
      actor: { ...actor },
      extra: values,
      source: { ...source },
      target: { ...target },
    };
    this.attach("run-context.json", document, "application/json");
  }

  /** Read a named secret and register its value. */
  secret(name: string): string {
    if (typeof name !== "string" || !SECRET_NAME.test(name)) {
      throw new TypeError(
        `secret name ${String(name)} must be letters, digits and underscores`,
      );
    }
    const value = this.settings.readSecret(name);
    if (value === undefined || value.length === 0) {
      throw new SecretNotFound(
        `secret ${name} is not set (the default source reads QUALIFY_SECRET_${name})`,
      );
    }
    this.secrets.add(name);
    this.redact(value);
    return value;
  }

  /** Names of secrets read, sorted. */
  secretsUsed(): string[] {
    return [...this.secrets].sort(Values.compare);
  }

  /**
   * Wait for delegated work the body did not await. Returns the first
   * failure among them, if any.
   */
  async settle(): Promise<{ error: unknown } | undefined> {
    const results = await Promise.allSettled(this.pending);
    const failed = results.find((r) => r.status === "rejected");
    return failed
      ? { error: (failed as PromiseRejectedResult).reason }
      : undefined;
  }

  /** Skip the test at runtime. */
  skip(reason: string): never {
    nonEmpty(reason, "skip reason");
    throw new SkipSignal(reason);
  }

  /** Failed soft checks, in call order. */
  softFailures(): CheckRecord[] {
    return this.checks().filter((c) => c.soft && !c.pass);
  }

  private assertion(
    context: string,
    description: string,
    soft: boolean,
    actual: unknown,
  ): Assertion {
    const run = (
      matcher: Parameters<typeof Matchers.evaluate>[0],
      argument?: unknown,
    ): boolean => {
      const seq = this.seq++;
      const site = this.settings.site();
      const result: MatchResult = Matchers.evaluate(matcher, actual, argument);
      this.recorded.push({
        seq,
        context,
        description,
        matcher,
        expected: result.expected,
        actual: result.actual,
        pass: result.pass,
        soft,
        site,
        at: this.settings.now().toISOString(),
      });
      if (!result.pass && !soft) {
        throw new CheckFailed(`${context}: ${description}`, site);
      }
      return result.pass;
    };
    return {
      atLeast: (bound) => run("atLeast", bound),
      atMost: (bound) => run("atMost", bound),
      contains: (expected) => run("contains", expected),
      equals: (expected) => run("equals", expected),
      hasLength: (length) => run("hasLength", length),
      isFalse: () => run("isFalse"),
      isNotNull: () => run("isNotNull"),
      isNull: () => run("isNull"),
      isTrue: () => run("isTrue"),
      matches: (pattern) => run("matches", pattern),
      notEquals: (expected) => run("notEquals", expected),
      oneOf: (values) => run("oneOf", values),
    };
  }

  private builder(context: string, description: string, soft: boolean): Check {
    return {
      soft: () => this.builder(context, description, true),
      that: (actual: unknown) =>
        this.assertion(context, description, soft, actual),
    };
  }
}
