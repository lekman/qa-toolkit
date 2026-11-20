package com.lekman.qualify;

import org.jspecify.annotations.Nullable;

/** The declared effect of an OQ or PQ test on the system under test. */
public enum Scope {
  /** The default of the annotation attribute: not declared, which is a declaration error. */
  UNDECLARED(null),
  /** Reads only. */
  READ("read"),
  /** Reads and writes; skipped in production unless an override names the test. */
  READ_WRITE("read-write");

  private final @Nullable String json;

  Scope(@Nullable String json) {
    this.json = json;
  }

  /** The value written to the evidence, or {@code null} for {@link #UNDECLARED}. */
  public @Nullable String json() {
    return json;
  }
}
