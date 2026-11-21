package com.lekman.qualify.internal.trace;

/** A protocol or map file that cannot be used. Exit 2. */
public final class TraceInputError extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** An input error. */
  public TraceInputError(String message) {
    super(message);
  }
}
