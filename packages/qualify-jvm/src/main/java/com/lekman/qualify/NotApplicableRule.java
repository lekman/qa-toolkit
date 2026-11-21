package com.lekman.qualify;

import java.util.List;

/**
 * Skips matching tests as not applicable, with a reason. A rule matches a test carrying any of its
 * tags (or any test, when it lists none) in any of its environments (or any environment, when it
 * lists none).
 *
 * @param reason recorded as the skip reason
 * @param tags tags to match; empty matches every test
 * @param environments environments to match; empty matches every environment
 */
public record NotApplicableRule(String reason, List<String> tags, List<String> environments) {
  /** A rule; the lists are copied. */
  public NotApplicableRule {
    if (reason == null || reason.isBlank()) {
      throw new IllegalArgumentException("a not-applicable rule needs a reason");
    }
    tags = List.copyOf(tags);
    environments = List.copyOf(environments);
  }
}
