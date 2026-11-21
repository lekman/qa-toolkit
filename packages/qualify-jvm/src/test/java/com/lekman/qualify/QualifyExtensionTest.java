package com.lekman.qualify;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.fixtures.Fixtures;
import com.lekman.qualify.internal.schema.Schemas;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.platform.engine.TestExecutionResult;
import org.junit.platform.launcher.TagFilter;

/** The extension end to end, through the JUnit testkit. */
class QualifyExtensionTest {

  @Test
  void passingTestsWriteValidMarkersAndRecords() {
    Testkit.Run run = Testkit.run(Fixtures.Passing.class);
    run.results().testEvents().assertStatistics(s -> s.succeeded(4).failed(0));
    assertEquals(8, run.names().size());
    for (String name : run.names()) {
      assertTrue(name.startsWith(Testkit.RUN_ID + "__"), name);
      assertEquals(List.of(), Schemas.evidence(run.file(name)), name);
    }
    Map<String, Object> install = run.record("IQ-FIX-001");
    assertEquals("pass", install.get("outcome"));
    assertEquals("read", install.get("scope"));
    assertEquals("high", install.get("risk"));
    assertEquals(List.of("first", "second"), install.get("and"));
    assertEquals(List.of("alpha", "smoke", "zeta"), install.get("tags"));
    assertTrue(
        ((String) install.get("site"))
            .startsWith(
                "packages/qualify-jvm/src/test/java/com/lekman/qualify/fixtures/Fixtures.java:"),
        String.valueOf(install.get("site")));
    assertEquals("read-write", run.record("IU-FIX-004").get("scope"));
    assertEquals("OQ-FIX-099", run.record("OQ-FIX-002").get("controls"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentsAreNormalisedAndRedacted() {
    Testkit.Run run = Testkit.run(Fixtures.Passing.class);
    List<Map<String, Object>> attachments =
        (List<Map<String, Object>>) run.record("OQ-FIX-002").get("attachments");
    assertEquals(5, attachments.size());
    assertEquals(
        "{\n  \"a\": [\n    true,\n    null\n  ],\n  \"b\": 1\n}\n", decode(attachments.get(1)));
    assertEquals("{not json", decode(attachments.get(2)));
    assertEquals(
        "{\n  \"ok\": 1,\n  \"password\": \"[REDACTED]\"\n}\n", decode(attachments.get(3)));
    assertEquals("run-context.json", attachments.get(4).get("filename"));
    assertTrue(decode(attachments.get(4)).contains("\"build\": 7"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void failuresAreClassified() {
    Testkit.Run run =
        Testkit.run(
            Fixtures.Failing.class,
            Map.of("qualify.configuration", Fixtures.Project.class.getName()));
    Map<String, Object> hard = run.record("OQ-FIX-010");
    assertEquals("fail", hard.get("outcome"));
    assertEquals("fixture: fails", error(hard).get("message"));
    Map<String, Object> soft = run.record("OQ-FIX-011");
    assertEquals("fail", soft.get("outcome"));
    assertEquals("2 soft check(s) failed", error(soft).get("message"));
    Map<String, Object> thrown = run.record("OQ-FIX-012");
    assertEquals("error", thrown.get("outcome"));
    assertEquals("UnsupportedOperationException", error(thrown).get("type"));
    assertEquals("", error(thrown).get("message"));
    Map<String, Object> assumption = run.record("OQ-FIX-013");
    assertEquals("skip", assumption.get("outcome"));
    assertEquals("Assumption failed: not on this machine", assumption.get("skipReason"));
    Map<String, Object> delegate = run.record("OQ-FIX-014");
    assertEquals("error", delegate.get("outcome"));
    Map<String, Object> check = ((List<Map<String, Object>>) delegate.get("checks")).get(0);
    assertEquals("bad input", check.get("actual"));
    assertTrue(
        ((String) check.get("delegate")).contains("Fixtures$Failing.lambda$"),
        String.valueOf(check.get("delegate")));
    assertEquals("SecretNotFound", error(run.record("OQ-FIX-017")).get("type"));
    assertEquals("skip", run.record("OQ-FIX-018").get("outcome"));
    assertEquals("no fixture for [REDACTED]", run.record("OQ-FIX-018").get("skipReason"));
    assertEquals("fail", run.record("OQ-FIX-019").get("outcome"));
  }

  @Test
  void secretsNeverReachTheEvidenceOrTheRunner() throws IOException {
    Testkit.Run run =
        Testkit.run(
            Fixtures.Failing.class,
            Map.of("qualify.configuration", Fixtures.Project.class.getName()));
    try (Stream<Path> files = Files.walk(run.dir())) {
      for (Path file : files.filter(Files::isRegularFile).toList()) {
        assertFalse(
            Files.readString(file, StandardCharsets.UTF_8).contains("fixture-token-value"),
            file.toString());
      }
    }
    assertEquals("leaked [REDACTED]", error(run.record("OQ-FIX-015")).get("message"));
    assertEquals(List.of("FIXTURE_TOKEN"), run.record("OQ-FIX-015").get("secretsUsed"));
    run.results().allEvents().stream()
        .flatMap(e -> e.getPayload(TestExecutionResult.class).stream())
        .flatMap(r -> r.getThrowable().stream())
        .forEach(
            t ->
                assertFalse(
                    String.valueOf(t.getMessage()).contains("fixture-token-value"), t.toString()));
  }

  @Test
  void productionBlocksWritesUnlessOverridden() {
    Testkit.Run blocked =
        Testkit.run(Fixtures.Writing.class, Map.of("qualify.environment", "prod"));
    blocked.results().testEvents().assertStatistics(s -> s.skipped(1).succeeded(1));
    assertEquals(
        "read-write test blocked in production environment prod",
        blocked.record("OQ-FIX-020").get("skipReason"));
    Testkit.Run allowed =
        Testkit.run(
            Fixtures.Writing.class,
            Map.of(
                "qualify.environment", "prod", "qualify.allowWrite", "OQ-FIX-020=release check"));
    assertEquals("pass", allowed.record("OQ-FIX-020").get("outcome"));
  }

  @Test
  void conditionsSwitchedOffStillApplyThePolicy() {
    Testkit.Run run =
        Testkit.run(
            Fixtures.Writing.class,
            Map.of(
                "qualify.environment", "production", "junit.jupiter.conditions.deactivate", "*"));
    run.results().testEvents().assertStatistics(s -> s.aborted(1).succeeded(1));
    assertEquals("skip", run.record("OQ-FIX-020").get("outcome"));
  }

  @Test
  void projectConfigurationAppliesRules() {
    Testkit.Run run =
        Testkit.run(
            Fixtures.Writing.class,
            Map.of("qualify.configuration", Fixtures.Project.class.getName()));
    assertEquals("slow tests do not run here", run.record("OQ-FIX-021").get("skipReason"));
    assertEquals("pass", run.record("OQ-FIX-020").get("outcome"));
    Testkit.Run broken =
        Testkit.run(
            Fixtures.Writing.class,
            Map.of("qualify.configuration", Fixtures.Broken.class.getName()));
    assertEquals("skip", broken.record("OQ-FIX-020").get("outcome"));
  }

  @Test
  void badSettingsFailEveryTest() {
    Testkit.Run run =
        Testkit.run(
            Fixtures.Writing.class,
            Map.of("qualify.allowWrite", "OQ-FIX-020=x", "qualify.noOverrides", "true"));
    run.results().testEvents().assertStatistics(s -> s.failed(2));
    assertTrue(Testkit.failures(run).get(0).contains("QUALIFY_NO_OVERRIDES"));
    assertEquals(List.of(), run.names());
    Testkit.Run badId = Testkit.run(Fixtures.Writing.class, Map.of("qualify.runId", "nope"));
    assertTrue(Testkit.failures(badId).get(0).contains("QUALIFY_RUN_ID must be a ULID"));
    Testkit.Run badClass =
        Testkit.run(Fixtures.Writing.class, Map.of("qualify.configuration", "com.acme.Missing"));
    assertTrue(Testkit.failures(badClass).get(0).contains("com.acme.Missing"));
  }

  @Test
  void declarationErrorsFailAndWriteNothing() {
    Testkit.Run run = Testkit.run(Fixtures.Invalid.class);
    assertEquals(List.of(), run.names());
    String all = String.join("\n", Testkit.failures(run));
    for (String problem :
        List.of(
            "title must not be empty",
            "given must not be empty",
            "when must not be empty",
            "then must not be empty",
            "controls must be the ID of another qualification test",
            "title must be one line",
            "and must be a list of clauses",
            "requirements are duplicated: R",
            "each requirement ID must be 1 to 64 characters",
            "tags must be a list of strings",
            "a test cannot be the control for itself",
            "exactly one of @IQ, @OQ, @PQ and @IU",
            "parametrised qualification tests are refused")) {
      assertTrue(all.contains(problem), problem + " in\n" + all);
    }
  }

  @Test
  void aJUnitTagSelectsAndIsRecorded() {
    Testkit.Run selected =
        Testkit.run(Fixtures.Passing.class, Map.of(), TagFilter.includeTags("smoke"));
    selected.results().testEvents().assertStatistics(s -> s.started(1));
    assertEquals(List.of("alpha", "smoke", "zeta"), selected.record("IQ-FIX-001").get("tags"));
    // A value only in the annotation's tags is recorded, but JUnit cannot select by it.
    Testkit.Run notSelected =
        Testkit.run(Fixtures.Passing.class, Map.of(), TagFilter.includeTags("zeta"));
    notSelected.results().testEvents().assertStatistics(s -> s.started(0));
    Testkit.Run level = Testkit.run(Fixtures.Passing.class, Map.of(), TagFilter.includeTags("OQ"));
    level.results().testEvents().assertStatistics(s -> s.started(1));
  }

  @Test
  void withoutARunIdOneSessionSharesOne() {
    Map<String, String> config = new java.util.HashMap<>();
    config.put("qualify.runId", "");
    Testkit.Run run = Testkit.run(Fixtures.Passing.class, config);
    assertEquals(1, run.names().stream().map(n -> n.substring(0, 26)).distinct().count());
    assertFalse(run.names().get(0).startsWith(Testkit.RUN_ID));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> error(Map<String, Object> test) {
    return (Map<String, Object>) test.get("error");
  }

  private static String decode(Map<String, Object> attachment) {
    return new String(
        Base64.getDecoder().decode((String) attachment.get("content")), StandardCharsets.UTF_8);
  }
}
