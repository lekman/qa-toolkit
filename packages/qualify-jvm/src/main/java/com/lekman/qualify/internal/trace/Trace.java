package com.lekman.qualify.internal.trace;

import com.lekman.qualify.internal.json.Json;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.jspecify.annotations.Nullable;

/**
 * The rows of the trace matrix for one run file, as the report shows them. The {@code trace}
 * command itself, with its Markdown and JSON output, is in the TypeScript package.
 *
 * @param rows the rows, sorted
 * @param notRun protocol IDs with no record, sorted
 * @param requirementsWithoutPass requirements with no passing test, sorted
 */
public record Trace(
    List<TraceRow> rows, List<String> notRun, List<String> requirementsWithoutPass) {

  private static final List<String> SOURCE_ORDER = List.of("code", "protocol", "map");

  /**
   * Build the matrix: one row per requirement link of each test, plus rows for protocol IDs with no
   * record. Links are the union of the code, the protocol and the map.
   */
  @SuppressWarnings("unchecked")
  public static Trace build(
      Map<String, Object> runFile, List<ProtocolEntry> protocol, Map<String, List<String>> map) {
    Map<String, ProtocolEntry> entries = new LinkedHashMap<>();
    protocol.forEach(e -> entries.put(e.id(), e));
    Map<String, Object> run = (Map<String, Object>) Objects.requireNonNull(runFile.get("run"));
    String runId = String.valueOf(run.get("id"));
    List<Map<String, Object>> tests = new ArrayList<>();
    for (Object item : (List<Object>) Objects.requireNonNull(runFile.get("tests"))) {
      tests.add((Map<String, Object>) item);
    }
    Set<String> seen = new HashSet<>();
    List<TraceRow> rows = new ArrayList<>();
    for (Map<String, Object> test : tests) {
      String id = String.valueOf(test.get("id"));
      seen.add(id);
      ProtocolEntry entry = entries.get(id);
      String risk = (String) test.get("risk");
      if (risk == null && entry != null) {
        risk = entry.risk();
      }
      for (Map.Entry<@Nullable String, List<String>> link :
          links(
                  (List<String>) Objects.requireNonNull(test.get("requirements")),
                  entry == null ? List.of() : entry.requirements(),
                  map.getOrDefault(id, List.of()))
              .entrySet()) {
        rows.add(
            new TraceRow(
                link.getKey(),
                link.getValue(),
                id,
                String.valueOf(test.get("level")),
                String.valueOf(test.get("title")),
                risk,
                (String) test.get("controls"),
                String.valueOf(test.get("outcome")),
                runId));
      }
    }
    TreeSet<String> notRun = new TreeSet<>(Json.CODE_POINT_ORDER);
    entries.keySet().stream().filter(id -> !seen.contains(id)).forEach(notRun::add);
    for (String id : notRun) {
      ProtocolEntry entry = Objects.requireNonNull(entries.get(id));
      for (Map.Entry<@Nullable String, List<String>> link :
          links(List.of(), entry.requirements(), map.getOrDefault(id, List.of())).entrySet()) {
        rows.add(
            new TraceRow(
                link.getKey(),
                link.getValue(),
                id,
                entry.level(),
                entry.title(),
                entry.risk(),
                null,
                "not-run",
                null));
      }
    }
    List<TraceRow> sorted = sort(rows);
    TreeSet<String> requirements = new TreeSet<>(Json.CODE_POINT_ORDER);
    for (TraceRow row : sorted) {
      if (row.requirement() != null) {
        requirements.add(row.requirement());
      }
    }
    List<String> withoutPass =
        requirements.stream()
            .filter(
                r ->
                    sorted.stream()
                        .noneMatch(
                            row -> r.equals(row.requirement()) && "pass".equals(row.outcome())))
            .toList();
    return new Trace(sorted, List.copyOf(notRun), withoutPass);
  }

  private static Map<@Nullable String, List<String>> links(
      List<String> code, List<String> protocol, List<String> map) {
    Map<String, Set<String>> found = new LinkedHashMap<>();
    code.forEach(r -> found.computeIfAbsent(r, k -> new LinkedHashSet<>()).add("code"));
    protocol.forEach(r -> found.computeIfAbsent(r, k -> new LinkedHashSet<>()).add("protocol"));
    map.forEach(r -> found.computeIfAbsent(r, k -> new LinkedHashSet<>()).add("map"));
    Map<@Nullable String, List<String>> result = new LinkedHashMap<>();
    if (found.isEmpty()) {
      result.put(null, List.of());
      return result;
    }
    found.forEach(
        (requirement, sources) ->
            result.put(requirement, SOURCE_ORDER.stream().filter(sources::contains).toList()));
    return result;
  }

  /**
   * Rows by requirement (none last), then test ID, then run. A control test sorts directly after
   * the test it controls when both have rows under the same requirement.
   */
  private static List<TraceRow> sort(List<TraceRow> rows) {
    Set<String> present = new HashSet<>();
    rows.forEach(r -> present.add(key(r.requirement(), r.testId())));
    java.util.function.Function<TraceRow, String> anchor =
        row ->
            row.controls() != null && present.contains(key(row.requirement(), row.controls()))
                ? row.controls()
                : row.testId();
    Comparator<TraceRow> order =
        Comparator.<TraceRow, @Nullable String>comparing(
                TraceRow::requirement, Trace::compareNullable)
            .thenComparing(anchor, Json.CODE_POINT_ORDER)
            .thenComparingInt(row -> anchor.apply(row).equals(row.testId()) ? 0 : 1)
            .thenComparing(TraceRow::testId, Json.CODE_POINT_ORDER)
            .thenComparing(TraceRow::run, Trace::compareNullable);
    List<TraceRow> sorted = new ArrayList<>(rows);
    sorted.sort(order);
    return sorted;
  }

  private static int compareNullable(@Nullable String a, @Nullable String b) {
    if (Objects.equals(a, b)) {
      return 0;
    }
    if (a == null) {
      return 1;
    }
    if (b == null) {
      return -1;
    }
    return Json.compare(a, b);
  }

  private static String key(@Nullable String requirement, String testId) {
    return (requirement == null ? "" : requirement) + "\u0000" + testId;
  }
}
