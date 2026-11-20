const CHECK_FAILED = Symbol.for("@lekman/qualify.CheckFailed");
const SKIP = Symbol.for("@lekman/qualify.Skip");

/**
 * A failed check: thrown by a hard check at once, and at the end of the body
 * when any soft check failed. The outcome is `fail`.
 */
export class CheckFailed extends Error {
  /** The `path:line` of the failing check. */
  readonly site: string;

  constructor(message: string, site: string) {
    super(message);
    this.name = "CheckFailed";
    this.site = site;
    Object.defineProperty(this, CHECK_FAILED, { value: true });
  }

  /**
   * Whether a thrown value is a `CheckFailed`, also when it comes from another
   * copy of this module, as happens when a runner loads it twice.
   */
  static is(value: unknown): value is CheckFailed {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[CHECK_FAILED] === true
    );
  }
}

/** Thrown by `ctx.skip(reason)` to end the body. The outcome is `skip`. */
export class SkipSignal extends Error {
  /** Why the test was skipped. */
  readonly reason: string;

  constructor(reason: string) {
    super(`skipped: ${reason}`);
    this.name = "SkipSignal";
    this.reason = reason;
    Object.defineProperty(this, SKIP, { value: true });
  }

  /** Whether a thrown value is a `SkipSignal`, from any copy of this module. */
  static is(value: unknown): value is SkipSignal {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[SKIP] === true
    );
  }
}

/** An attachment over the size limit. The outcome is `error`. */
export class AttachmentTooLarge extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentTooLarge";
  }
}

/** `ctx.secret(name)` found no value for the name. The outcome is `error`. */
export class SecretNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretNotFound";
  }
}
