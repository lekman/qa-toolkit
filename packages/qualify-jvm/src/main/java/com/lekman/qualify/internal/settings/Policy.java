package com.lekman.qualify.internal.settings;

import com.lekman.qualify.NotApplicableRule;
import com.lekman.qualify.internal.declaration.Declaration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Write protection and "not applicable" rules, section 5 of the specification. */
public final class Policy {

  private Policy() {}

  /** The policy as the run envelope records it. */
  public static Map<String, Object> info(Settings settings) {
    Map<String, Object> json = new LinkedHashMap<>();
    json.put("productionWriteBlocked", settings.productionWriteBlocked());
    List<Object> overrides = new ArrayList<>();
    for (PolicyOverride o : settings.overrides()) {
      overrides.add(o.toJson());
    }
    json.put("overrides", overrides);
    return json;
  }

  /** The reason to skip a test before its body runs, or empty to run it. */
  public static Optional<String> skipReason(Declaration declaration, Settings settings) {
    if (settings.productionWriteBlocked()
        && "read-write".equals(declaration.scope())
        && settings.overrides().stream().noneMatch(o -> o.id().equals(declaration.id()))) {
      return Optional.of(
          "read-write test blocked in production environment " + settings.environment());
    }
    for (NotApplicableRule rule : settings.notApplicable()) {
      boolean tagMatch =
          rule.tags().isEmpty() || rule.tags().stream().anyMatch(declaration.tags()::contains);
      boolean environmentMatch =
          rule.environments().isEmpty() || rule.environments().contains(settings.environment());
      if (tagMatch && environmentMatch) {
        return Optional.of(rule.reason());
      }
    }
    return Optional.empty();
  }
}
