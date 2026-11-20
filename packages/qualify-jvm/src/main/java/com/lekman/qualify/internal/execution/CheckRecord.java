package com.lekman.qualify.internal.execution;

import java.util.LinkedHashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * One recorded check.
 *
 * @param seq the 0-based position in call order
 * @param context what is checked
 * @param description the claim
 * @param matcher the shared matcher name
 * @param expected the normalised expected value
 * @param actual the normalised actual value
 * @param pass whether it passed
 * @param soft whether it is a soft check
 * @param site the {@code path:line} of the check
 * @param delegate the delegated function's name, only for {@code delegate}
 * @param at when it was recorded
 */
public record CheckRecord(
    int seq,
    String context,
    String description,
    String matcher,
    @Nullable Object expected,
    @Nullable Object actual,
    boolean pass,
    boolean soft,
    String site,
    @Nullable String delegate,
    String at) {

  /** As the evidence writes it. */
  public Map<String, Object> toJson() {
    Map<String, Object> json = new LinkedHashMap<>();
    json.put("seq", (long) seq);
    json.put("context", context);
    json.put("description", description);
    json.put("matcher", matcher);
    json.put("expected", expected);
    json.put("actual", actual);
    json.put("pass", pass);
    json.put("soft", soft);
    json.put("site", site);
    if (delegate != null) {
      json.put("delegate", delegate);
    }
    json.put("at", at);
    return json;
  }
}
