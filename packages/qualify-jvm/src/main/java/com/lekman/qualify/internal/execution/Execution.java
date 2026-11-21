package com.lekman.qualify.internal.execution;

import com.lekman.qualify.CheckFailed;
import com.lekman.qualify.internal.declaration.Declaration;
import com.lekman.qualify.internal.evidence.EvidenceFiles;
import com.lekman.qualify.internal.evidence.EvidenceShape;
import com.lekman.qualify.internal.evidence.EvidenceWriter;
import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.redaction.Redaction;
import com.lekman.qualify.internal.values.Values;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.jspecify.annotations.Nullable;

/**
 * One qualification test's evidence: the started marker when it starts, and the redacted record
 * when it ends. The JUnit extension calls it; nothing here depends on JUnit.
 */
public final class Execution {

  private final Session session;
  private final Declaration declaration;
  private final Class<?> testClass;
  private final String key;
  private final TestContext context;
  private final AtomicBoolean recorded = new AtomicBoolean();
  private @Nullable Instant started;

  /** The evidence of one test of a session. */
  public Execution(Session session, Declaration declaration, Class<?> testClass) {
    this.session = session;
    this.declaration = declaration;
    this.testClass = testClass;
    this.key = EvidenceFiles.key(declaration.site());
    this.context =
        new TestContext(
            new TestContext.Options(
                declaration.id(),
                declaration.level(),
                session.settings().environment(),
                session.settings().attachmentLimit(),
                session.clock(),
                session.registry(),
                session.settings().secretSource(),
                this::runContext,
                () -> session.sites().caller().orElse(declaration.site()),
                session.warn()));
  }

  /** The validated declaration. */
  public Declaration declaration() {
    return declaration;
  }

  /** The test's context. */
  public TestContext context() {
    return context;
  }

  /**
   * How a test ended, as its record says.
   *
   * @param classification the outcome
   * @param site the failure's site, or {@code null}
   */
  public record Ending(Outcomes.Classification classification, @Nullable String site) {}

  /**
   * Write the record, once: the outcome from what the body threw and its failed soft checks.
   *
   * @param thrown what the body threw, or {@code null}
   * @return how the test ended, or {@code null} when the record was already written
   */
  public @Nullable Ending finish(@Nullable Throwable thrown) {
    if (!recorded.compareAndSet(false, true)) {
      return null;
    }
    List<CheckRecord> soft = context.softFailures();
    Outcomes.Classification classification = Outcomes.classify(thrown, soft.size());
    String site = null;
    if (classification.errorType() != null) {
      if (thrown == null) {
        site = soft.get(0).site();
      } else if (thrown instanceof CheckFailed failed) {
        site = failed.getSite();
      } else {
        site = session.sites().inClass(thrown, testClass).orElse(null);
      }
    }
    write(classification, site, context.checks(), context.attachments(), context.secretsUsed());
    return new Ending(classification, site);
  }

  /** Whether the record has been written. */
  public boolean isRecorded() {
    return recorded.get();
  }

  /** Redact a failure's message with the values registered so far. */
  public String redact(String text) {
    return Redaction.text(text, session.registry().values());
  }

  /**
   * Record a skip decided before the body runs, such as a policy denial: the marker, then a record
   * with no checks.
   */
  public void skipBeforeStart(String reason) {
    start();
    if (recorded.compareAndSet(false, true)) {
      write(Outcomes.Classification.skip(reason), null, List.of(), List.of(), List.of());
    }
  }

  /** Write the started marker. */
  public void start() {
    Instant now = session.clock().get();
    started = now;
    Map<String, Object> test = redacted(declaration.toJson());
    test.put("startedAt", Values.timestamp(now));
    Map<String, Object> marker = new LinkedHashMap<>();
    marker.put("schemaVersion", 1L);
    marker.put("kind", "started");
    marker.put("run", session.run());
    marker.put("test", test);
    store(EvidenceFiles.marker(session.runId(), declaration.id(), key), marker);
  }

  /** Whether the marker has been written. */
  public boolean isStarted() {
    return started != null;
  }

  private Map<String, Object> redacted(Map<String, Object> value) {
    return Redaction.object(value, session.registry().values());
  }

  private Map<String, Object> runContext() {
    return session.run();
  }

  private void store(String name, Map<String, Object> file) {
    Path path = session.evidenceDir().resolve("records").resolve(name);
    try {
      EvidenceWriter.write(
          path, Json.document(file, EvidenceShape.FILE).getBytes(StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new UncheckedIOException("qualify: cannot write " + path, e);
    }
  }

  private void write(
      Outcomes.Classification classification,
      @Nullable String failureSite,
      List<CheckRecord> checks,
      List<PendingAttachment> attachments,
      List<String> secretsUsed) {
    Instant begin = started == null ? session.clock().get() : started;
    Instant end = session.clock().get();
    Map<String, Object> test = declaration.toJson();
    test.put("outcome", classification.outcome());
    if (classification.skipReason() != null) {
      test.put("skipReason", classification.skipReason());
    }
    if (classification.errorType() != null) {
      Map<String, Object> error = new LinkedHashMap<>();
      error.put("type", classification.errorType());
      error.put("message", classification.errorMessage());
      error.put("site", failureSite);
      test.put("error", error);
    }
    test.put("startedAt", Values.timestamp(begin));
    test.put("endedAt", Values.timestamp(end));
    test.put("durationMs", Math.max(0L, end.toEpochMilli() - begin.toEpochMilli()));
    List<Object> checkJson = new ArrayList<>();
    for (CheckRecord check : checks) {
      checkJson.add(check.toJson());
    }
    test.put("checks", checkJson);
    test.put("secretsUsed", new ArrayList<Object>(secretsUsed));
    List<String> registered = session.registry().values();
    Map<String, Object> redactedTest = redacted(test);
    List<Object> attachmentJson = new ArrayList<>();
    for (PendingAttachment pending : attachments) {
      attachmentJson.add(Attachments.finalise(pending, registered));
    }
    redactedTest.put("attachments", attachmentJson);
    Map<String, Object> record = new LinkedHashMap<>();
    record.put("schemaVersion", 1L);
    record.put("kind", "record");
    record.put("run", session.run());
    record.put("test", redactedTest);
    store(EvidenceFiles.record(session.runId(), declaration.id(), key), record);
  }
}
