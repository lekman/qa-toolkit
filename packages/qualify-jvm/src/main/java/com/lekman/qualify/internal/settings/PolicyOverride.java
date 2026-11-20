package com.lekman.qualify.internal.settings;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A test allowed to write in production for this run.
 *
 * @param id the test ID
 * @param reason why
 */
public record PolicyOverride(String id, String reason) {
  /** As the run envelope records it. */
  public Map<String, Object> toJson() {
    Map<String, Object> json = new LinkedHashMap<>();
    json.put("id", id);
    json.put("reason", reason);
    return json;
  }
}
