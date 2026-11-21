package com.lekman.qualify.internal.merge;

import com.lekman.qualify.internal.evidence.EvidenceFiles;
import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.json.JsonFormatException;
import com.lekman.qualify.internal.redaction.Redaction;
import com.lekman.qualify.internal.schema.Schemas;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * {@code qualify merge}: builds the run file from records and markers, section 6.5 of the
 * specification. Pure: the caller reads and writes.
 */
public final class Merge {

  private static final List<String> AGREE = List.of("environment", "source", "policy");

  private Merge() {}

  /**
   * One file of a records directory.
   *
   * @param name the file name
   * @param text its content
   */
  public record Input(String name, String text) {}

  /**
   * The outcome of a merge: a run file and its exit code, or the reasons there is none (exit 2).
   *
   * @param exitCode 0 pass, 1 fail, 2 invalid input, 3 incomplete
   * @param file the run file, when the input was valid
   * @param errors why the input is invalid
   */
  public record Result(int exitCode, @Nullable Map<String, Object> file, List<String> errors) {}

  /** A file read from the directory, with its parsed content. */
  private record Read(String name, Map<String, Object> file) {
    @SuppressWarnings("unchecked")
    Map<String, Object> run() {
      return (Map<String, Object>) Objects.requireNonNull(file.get("run"));
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> test() {
      return (Map<String, Object>) Objects.requireNonNull(file.get("test"));
    }

    String runId() {
      return (String) Objects.requireNonNull(run().get("id"));
    }

    String testId() {
      return (String) Objects.requireNonNull(test().get("id"));
    }
  }

  /** The marker and the record of one test instance. */
  private static final class Pair {
    @Nullable Read marker;
    @Nullable Read record;

    Read any() {
      Read r = record != null ? record : marker;
      if (r == null) {
        throw new IllegalStateException("a pair holds a marker or a record");
      }
      return r;
    }
  }

  /**
   * Merge the files of one records directory.
   *
   * @param inputs the files, in any order
   * @param allowRuns other run IDs that may be merged in
   * @param emptyEnvelope the envelope of a run with no records
   * @param now the current timestamp
   */
  public static Result build(
      List<Input> inputs,
      List<String> allowRuns,
      Supplier<Map<String, Object>> emptyEnvelope,
      Supplier<String> now) {
    List<String> errors = new ArrayList<>();
    Map<String, Pair> pairs = new TreeMap<>(Json.CODE_POINT_ORDER);
    List<Input> sorted = new ArrayList<>(inputs);
    sorted.sort(Comparator.comparing(Input::name, Json.CODE_POINT_ORDER));
    for (Input input : sorted) {
      if (input.name().startsWith(".")) {
        continue;
      }
      read(input, errors)
          .ifPresent(
              read -> {
                EvidenceFiles.Name name = EvidenceFiles.parse(input.name()).orElseThrow();
                Pair pair = pairs.computeIfAbsent(name.stem(), k -> new Pair());
                if (name.started()) {
                  pair.marker = read;
                } else {
                  pair.record = read;
                }
              });
    }
    if (!errors.isEmpty()) {
      return new Result(2, null, errors);
    }
    List<Read> all = new ArrayList<>();
    for (Pair pair : pairs.values()) {
      if (pair.marker != null) {
        all.add(pair.marker);
      }
      if (pair.record != null) {
        all.add(pair.record);
      }
    }
    Set<String> ids = new TreeSet<>(Json.CODE_POINT_ORDER);
    all.forEach(r -> ids.add(r.runId()));
    List<String> primaries = ids.stream().filter(id -> !allowRuns.contains(id)).toList();
    if (primaries.size() > 1) {
      return new Result(
          2,
          null,
          List.of(
              "records come from more than one run ("
                  + String.join(", ", primaries)
                  + "); name the runs to merge in with --allow-runs"));
    }
    if (primaries.isEmpty() && !ids.isEmpty()) {
      return new Result(
          2,
          null,
          List.of("--allow-runs names every run in the directory; leave the main run out"));
    }
    String primary = primaries.isEmpty() ? null : primaries.get(0);
    errors.addAll(duplicates(pairs));
    errors.addAll(disagreements(all));
    if (!errors.isEmpty()) {
      return new Result(2, null, errors);
    }
    List<Map<String, Object>> tests = new ArrayList<>();
    for (Pair pair : pairs.values()) {
      tests.add(test(pair));
    }
    tests.sort(Comparator.comparing(t -> (String) t.get("id"), Json.CODE_POINT_ORDER));
    List<String> merged = ids.stream().filter(id -> !id.equals(primary)).toList();
    Map<String, Object> summary = summary(tests);
    Map<String, Object> file = new LinkedHashMap<>();
    file.put("schemaVersion", 1L);
    file.put("kind", "run");
    file.put("run", envelope(all, primary, merged, tests, emptyEnvelope, now));
    file.put("summary", summary);
    file.put("tests", new ArrayList<Object>(tests));
    String verdict = (String) Objects.requireNonNull(summary.get("verdict"));
    int exit = verdict.equals("fail") ? 1 : verdict.equals("incomplete") ? 3 : 0;
    return new Result(exit, file, List.of());
  }

  /** Counts and verdict: fail on any fail or error, incomplete with no tests, else pass. */
  public static Map<String, Object> summary(List<Map<String, Object>> tests) {
    long pass = count(tests, "pass");
    long fail = count(tests, "fail");
    long error = count(tests, "error");
    long skip = count(tests, "skip");
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("total", (long) tests.size());
    summary.put("pass", pass);
    summary.put("fail", fail);
    summary.put("error", error);
    summary.put("skip", skip);
    summary.put("verdict", fail + error > 0 ? "fail" : tests.isEmpty() ? "incomplete" : "pass");
    return summary;
  }

  private static long count(List<Map<String, Object>> tests, String outcome) {
    return tests.stream().filter(t -> outcome.equals(t.get("outcome"))).count();
  }

  /** Apply the pattern rules again, decoding attachments to redact their bytes. */
  @SuppressWarnings("unchecked")
  private static Map<String, Object> defend(Map<String, Object> test) {
    Map<String, Object> rest = new LinkedHashMap<>(test);
    List<Object> attachments = (List<Object>) rest.remove("attachments");
    Map<String, Object> result = Redaction.object(rest, List.of());
    List<Object> clean = new ArrayList<>();
    for (Object item : attachments == null ? List.of() : attachments) {
      Map<String, Object> attachment = new LinkedHashMap<>((Map<String, Object>) item);
      byte[] bytes = Base64.getDecoder().decode((String) attachment.get("content"));
      byte[] redacted = Redaction.bytes(bytes, List.of());
      if (!Arrays.equals(redacted, bytes)) {
        attachment.put("content", Base64.getEncoder().encodeToString(redacted));
        attachment.put("sizeBytes", (long) redacted.length);
        attachment.put("sha256", EvidenceFiles.sha256(redacted));
      }
      clean.add(attachment);
    }
    result.put("attachments", clean);
    return result;
  }

  private static List<String> disagreements(List<Read> all) {
    List<String> errors = new ArrayList<>();
    if (all.isEmpty()) {
      return errors;
    }
    Read first = all.get(0);
    for (String field : AGREE) {
      String expected = Json.compact(first.run().get(field));
      all.stream()
          .filter(r -> !Json.compact(r.run().get(field)).equals(expected))
          .findFirst()
          .ifPresent(
              other ->
                  errors.add(
                      "the run envelopes disagree on "
                          + field
                          + ": "
                          + first.name()
                          + " and "
                          + other.name()));
    }
    return errors;
  }

  private static List<String> duplicates(Map<String, Pair> pairs) {
    Map<String, List<String>> byId = new TreeMap<>(Json.CODE_POINT_ORDER);
    for (Map.Entry<String, Pair> entry : pairs.entrySet()) {
      byId.computeIfAbsent(entry.getValue().any().testId(), k -> new ArrayList<>())
          .add(entry.getKey());
    }
    List<String> errors = new ArrayList<>();
    byId.forEach(
        (id, stems) -> {
          if (stems.size() > 1) {
            errors.add(
                "test ID "
                    + id
                    + " appears "
                    + stems.size()
                    + " times in the run ("
                    + String.join(", ", stems)
                    + "); an ID must be unique within a run");
          }
        });
    return errors;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> envelope(
      List<Read> all,
      @Nullable String primary,
      List<String> merged,
      List<Map<String, Object>> tests,
      Supplier<Map<String, Object>> emptyEnvelope,
      Supplier<String> now) {
    Map<String, Object> source =
        all.stream()
            .filter(r -> r.runId().equals(primary))
            .min(Comparator.comparing(Read::testId, Json.CODE_POINT_ORDER))
            .map(Read::run)
            .orElseGet(emptyEnvelope);
    Map<String, Object> run = new LinkedHashMap<>(Redaction.object(source, List.of()));
    Object selection = run.remove("selection");
    Set<String> selections = new LinkedHashSet<>();
    all.forEach(r -> selections.add(Json.compact(r.run().get("selection"))));
    if (selection != null && selections.size() == 1) {
      run.put("selection", selection);
    }
    if (tests.isEmpty()) {
      String time = now.get();
      run.put("startedAt", time);
      run.put("endedAt", time);
    } else {
      run.put(
          "startedAt",
          tests.stream()
              .map(t -> (String) t.get("startedAt"))
              .min(String::compareTo)
              .orElseThrow());
      run.put(
          "endedAt",
          tests.stream().map(t -> (String) t.get("endedAt")).max(String::compareTo).orElseThrow());
    }
    if (!merged.isEmpty()) {
      run.put("mergedRuns", new ArrayList<Object>(merged));
    }
    return run;
  }

  @SuppressWarnings("unchecked")
  private static Optional<Read> read(Input input, List<String> errors) {
    Optional<EvidenceFiles.Name> name = EvidenceFiles.parse(input.name());
    if (name.isEmpty()) {
      errors.add(
          input.name()
              + ": not a record or marker name (<runId>__<testId>__<key>.json or .started)");
      return Optional.empty();
    }
    JsonNode node;
    try {
      node = Json.parseNode(input.text());
    } catch (JsonFormatException e) {
      errors.add(input.name() + ": not valid JSON (" + e.getMessage() + ")");
      return Optional.empty();
    }
    List<String> problems = Schemas.evidence(node);
    if (!problems.isEmpty()) {
      problems.forEach(p -> errors.add(input.name() + ": " + p));
      return Optional.empty();
    }
    Read read =
        new Read(input.name(), (Map<String, Object>) Objects.requireNonNull(Json.fromNode(node)));
    String kind = String.valueOf(read.file().get("kind"));
    String expectedKind = name.get().started() ? "started" : "record";
    if (!kind.equals(expectedKind)) {
      errors.add(input.name() + ": holds a " + kind + " file, not a " + expectedKind);
      return Optional.empty();
    }
    if (!read.runId().equals(name.get().runId()) || !read.testId().equals(name.get().testId())) {
      errors.add(
          input.name()
              + ": the name does not match run "
              + read.runId()
              + " and test "
              + read.testId());
      return Optional.empty();
    }
    if (!read.testId().startsWith(read.test().get("level") + "-")) {
      errors.add(
          input.name()
              + ": test "
              + read.testId()
              + " does not match its level "
              + read.test().get("level"));
      return Optional.empty();
    }
    return Optional.of(read);
  }

  private static Map<String, Object> test(Pair pair) {
    if (pair.record != null) {
      return defend(pair.record.test());
    }
    Map<String, Object> marker = new LinkedHashMap<>(pair.any().test());
    Object startedAt = marker.remove("startedAt");
    Map<String, Object> error = new LinkedHashMap<>();
    error.put("type", "DidNotFinish");
    error.put("message", "test started and did not finish");
    error.put("site", null);
    marker.put("outcome", "error");
    marker.put("error", error);
    marker.put("startedAt", startedAt);
    marker.put("endedAt", startedAt);
    marker.put("durationMs", 0L);
    marker.put("checks", new ArrayList<>());
    marker.put("attachments", new ArrayList<>());
    marker.put("secretsUsed", new ArrayList<>());
    return defend(marker);
  }
}
