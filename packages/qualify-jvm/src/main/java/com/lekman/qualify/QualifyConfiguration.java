package com.lekman.qualify;

import java.util.List;
import java.util.Optional;

/**
 * Project code that plugs into qualify. Name the implementing class in the JUnit configuration
 * parameter {@code qualify.configuration}; it needs a public no-argument constructor. Every method
 * has a default.
 */
public interface QualifyConfiguration {

  /**
   * The environment name, replacing the default resolver. If it throws or returns a blank name, the
   * environment is {@code production}. Empty keeps the default ({@code QUALIFY_ENVIRONMENT}, then
   * {@code local}).
   */
  default Optional<String> environment() {
    return Optional.empty();
  }

  /** Rules that skip tests as not applicable. */
  default List<NotApplicableRule> notApplicable() {
    return List.of();
  }

  /**
   * A secret's value, replacing the default source ({@code QUALIFY_SECRET_<NAME>}). Empty means the
   * secret is not set.
   */
  default Optional<String> secret(String name) {
    return Optional.ofNullable(System.getenv("QUALIFY_SECRET_" + name));
  }
}
