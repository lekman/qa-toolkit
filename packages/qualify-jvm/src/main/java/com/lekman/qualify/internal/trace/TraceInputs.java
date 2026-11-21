package com.lekman.qualify.internal.trace;

import com.lekman.qualify.internal.declaration.Declarations;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.dataformat.yaml.YAMLMapper;

/** Parsing of {@code protocol.yaml} and {@code trace.yaml}, section 8 of the specification. */
public final class TraceInputs {

  private static final YAMLMapper YAML = YAMLMapper.builder().build();
  private static final Set<String> LEVELS = Set.of("IQ", "OQ", "PQ", "IU");
  private static final Set<String> RISKS = Set.of("high", "medium", "low");
  private static final Set<String> ENTRY_KEYS =
      Set.of("id", "level", "requirements", "risk", "title");

  private TraceInputs() {}

  /** {@code trace.yaml}: test IDs mapped to one requirement ID or a list. */
  public static Map<String, List<String>> map(String text, String path) {
    JsonNode data = read(text, path);
    Map<String, List<String>> result = new LinkedHashMap<>();
    if (data == null || data.isNull() || data.isMissingNode()) {
      return result;
    }
    if (!data.isObject()) {
      throw new TraceInputError(path + ": must map test IDs to requirement IDs");
    }
    for (Map.Entry<String, JsonNode> entry : data.properties()) {
      if (!Declarations.isTestId(entry.getKey())) {
        throw new TraceInputError(path + ": " + entry.getKey() + " is not a test ID");
      }
      result.put(entry.getKey(), requirements(entry.getValue(), path + ": " + entry.getKey()));
    }
    return result;
  }

  /** {@code protocol.yaml}: the tests that must run, under a {@code tests} key. */
  public static List<ProtocolEntry> protocol(String text, String path) {
    JsonNode data = read(text, path);
    if (data == null || !data.isObject() || !data.path("tests").isArray()) {
      throw new TraceInputError(path + ": must have a \"tests\" list");
    }
    List<ProtocolEntry> entries = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    int index = 0;
    for (JsonNode raw : data.get("tests")) {
      String where = path + ": tests[" + index++ + "]";
      if (!raw.isObject()) {
        throw new TraceInputError(where + ": must be a mapping");
      }
      for (String key : raw.propertyNames()) {
        if (!ENTRY_KEYS.contains(key)) {
          throw new TraceInputError(where + ": unknown field " + key);
        }
      }
      String id = string(raw.get("id"));
      if (id == null || !Declarations.isTestId(id)) {
        throw new TraceInputError(where + ": id must be a test ID");
      }
      String level = string(raw.get("level"));
      if (level == null || !LEVELS.contains(level) || !id.startsWith(level + "-")) {
        throw new TraceInputError(where + ": level must be the prefix of " + id);
      }
      String title = string(raw.get("title"));
      if (title == null || title.isBlank()) {
        throw new TraceInputError(where + ": title must not be empty");
      }
      JsonNode riskNode = raw.get("risk");
      String risk = null;
      if (riskNode != null) {
        risk = string(riskNode);
        if (risk == null || !RISKS.contains(risk)) {
          throw new TraceInputError(where + ": risk must be high, medium or low");
        }
      }
      if (!seen.add(id)) {
        throw new TraceInputError(path + ": " + id + " is listed twice");
      }
      JsonNode requirements = raw.get("requirements");
      entries.add(
          new ProtocolEntry(
              id,
              level,
              title,
              requirements == null ? List.of() : requirements(requirements, where),
              risk));
    }
    return entries;
  }

  private static @Nullable JsonNode read(String text, String path) {
    try {
      return YAML.readTree(text);
    } catch (JacksonException e) {
      throw new TraceInputError(path + ": not valid YAML (" + e.getOriginalMessage() + ")");
    }
  }

  private static List<String> requirements(JsonNode value, String where) {
    List<String> list = new ArrayList<>();
    if (value.isString()) {
      list.add(value.stringValue());
    } else if (value.isArray()) {
      for (JsonNode item : value) {
        list.add(item.isString() ? item.stringValue() : "");
      }
    } else {
      list.add("");
    }
    if (list.stream().anyMatch(r -> r.isEmpty() || r.length() > 64)) {
      throw new TraceInputError(
          where + ": requirements must be requirement IDs of 1 to 64 characters");
    }
    if (new HashSet<>(list).size() != list.size()) {
      throw new TraceInputError(where + ": a requirement is listed twice");
    }
    return list;
  }

  private static @Nullable String string(@Nullable JsonNode node) {
    return node != null && node.isString() ? node.stringValue() : null;
  }
}
