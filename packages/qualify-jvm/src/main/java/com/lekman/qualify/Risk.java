package com.lekman.qualify;

import org.jspecify.annotations.Nullable;

/** The risk a test covers. */
public enum Risk {
  /** The default of the annotation attribute: no risk declared. */
  UNDECLARED(null),
  /** High risk. */
  HIGH("high"),
  /** Medium risk. */
  MEDIUM("medium"),
  /** Low risk. */
  LOW("low");

  private final @Nullable String json;

  Risk(@Nullable String json) {
    this.json = json;
  }

  /** The value written to the evidence, or {@code null} for {@link #UNDECLARED}. */
  public @Nullable String json() {
    return json;
  }
}
