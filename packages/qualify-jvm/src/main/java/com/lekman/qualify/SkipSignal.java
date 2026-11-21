package com.lekman.qualify;

import org.opentest4j.TestAbortedException;

/**
 * Thrown by {@link QualifyContext#skip(String)} to end the body. JUnit reports the test as skipped,
 * and the record's outcome is {@code skip}.
 */
public class SkipSignal extends TestAbortedException {

  private static final long serialVersionUID = 1L;

  private final String reason;

  /** A runtime skip with its reason. */
  public SkipSignal(String reason) {
    super(reason);
    this.reason = reason;
  }

  /** Why the test was skipped. */
  public String getReason() {
    return reason;
  }
}
