package com.lekman.qualify.internal.execution;

/**
 * Stands in for a failure whose message held a registered secret, so the runner's report never
 * shows the value. The message starts with the original type's name; the stack trace is the
 * original's.
 */
public final class RedactedFailure extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** A stand-in with a redacted message. */
  public RedactedFailure(String message) {
    super(message);
  }
}
