package com.lekman.qualify.internal.declaration;

import com.lekman.qualify.Level;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * A validated declaration: the fields shared by the started marker and the record.
 *
 * @param id the test ID
 * @param level the level
 * @param title the title
 * @param given the state before the test
 * @param when the action
 * @param then the expected result
 * @param and further clauses, or {@code null} when none were declared
 * @param scope {@code read} or {@code read-write}
 * @param requirements requirement IDs in declaration order
 * @param risk {@code high}, {@code medium}, {@code low}, or {@code null}
 * @param tags sorted, without duplicates
 * @param controls the ID of the test this one is the control for, or {@code null}
 * @param site the {@code path:line} of the declaration
 */
public record Declaration(
    String id,
    Level level,
    String title,
    String given,
    String when,
    String then,
    @Nullable List<String> and,
    String scope,
    List<String> requirements,
    @Nullable String risk,
    List<String> tags,
    @Nullable String controls,
    String site) {

  /** The declaration as the evidence writes it. */
  public Map<String, Object> toJson() {
    Map<String, Object> json = new LinkedHashMap<>();
    json.put("id", id);
    json.put("level", level.name());
    json.put("title", title);
    json.put("given", given);
    json.put("when", when);
    json.put("then", then);
    if (and != null) {
      json.put("and", List.copyOf(and));
    }
    json.put("scope", scope);
    json.put("requirements", List.copyOf(requirements));
    if (risk != null) {
      json.put("risk", risk);
    }
    json.put("tags", List.copyOf(tags));
    if (controls != null) {
      json.put("controls", controls);
    }
    json.put("site", site);
    return json;
  }
}
