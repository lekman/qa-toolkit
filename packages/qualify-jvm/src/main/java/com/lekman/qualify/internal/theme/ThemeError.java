package com.lekman.qualify.internal.theme;

/** A theme that cannot be used: invalid, incomplete, or with an unknown token. Exit 2. */
public final class ThemeError extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** A theme error. */
  public ThemeError(String message) {
    super(message);
  }
}
