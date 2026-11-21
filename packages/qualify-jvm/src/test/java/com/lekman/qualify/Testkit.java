package com.lekman.qualify;

import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;

import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.json.JsonFormatException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.platform.launcher.PostDiscoveryFilter;
import org.junit.platform.testkit.engine.EngineExecutionResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/** Runs fixture test classes through the Jupiter engine and reads the evidence they write. */
public final class Testkit {

  /** The run ID every testkit run uses. */
  public static final String RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000";

  private Testkit() {}

  /**
   * The outcome of one run.
   *
   * @param results JUnit's own results
   * @param dir the evidence directory
   */
  public record Run(EngineExecutionResults results, Path dir) {

    /** Every file name in {@code records/}, sorted. */
    public List<String> names() {
      Path records = dir.resolve("records");
      if (!Files.isDirectory(records)) {
        return List.of();
      }
      try (Stream<Path> files = Files.list(records)) {
        return files.map(p -> p.getFileName().toString()).sorted().toList();
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
    }

    /** The {@code test} of the record of a test ID. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> record(String id) {
      for (String name : names()) {
        if (name.contains("__" + id + "__") && name.endsWith(".json")) {
          Map<String, Object> file = file(name);
          return (Map<String, Object>) file.get("test");
        }
      }
      throw new AssertionError("no record for " + id + " in " + names());
    }

    /** A file of {@code records/}, parsed. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> file(String name) {
      try {
        return (Map<String, Object>)
            Json.parse(
                Files.readString(dir.resolve("records").resolve(name), StandardCharsets.UTF_8));
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      } catch (JsonFormatException e) {
        throw new AssertionError(e);
      }
    }
  }

  /** Run a fixture class with configuration parameters added to the defaults. */
  public static Run run(
      Class<?> fixture, Map<String, String> config, PostDiscoveryFilter... filters) {
    Path dir;
    try {
      dir = Files.createTempDirectory("qualify-testkit-");
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    Map<String, String> all = new HashMap<>();
    all.put("qualify.evidenceDir", dir.toString());
    all.put("qualify.runId", RUN_ID);
    all.putAll(config);
    EngineExecutionResults results =
        EngineTestKit.engine("junit-jupiter")
            .selectors(selectClass(fixture))
            .configurationParameters(all)
            .filters(filters)
            .execute();
    return new Run(results, dir);
  }

  /** Run a fixture class with the default configuration. */
  public static Run run(Class<?> fixture) {
    return run(fixture, Map.of());
  }

  /** The messages of every failure of a run, for assertions on declaration errors. */
  public static List<String> failures(Run run) {
    List<String> messages = new ArrayList<>();
    run.results().testEvents().failed().stream()
        .forEach(
            event ->
                event
                    .getPayload(org.junit.platform.engine.TestExecutionResult.class)
                    .flatMap(org.junit.platform.engine.TestExecutionResult::getThrowable)
                    .ifPresent(
                        t -> {
                          StringBuilder text = new StringBuilder();
                          for (Throwable c = t;
                              c != null && text.length() < 4000;
                              c = c.getCause()) {
                            text.append(c.getMessage()).append(" | ");
                          }
                          messages.add(text.toString());
                        }));
    return messages;
  }
}
