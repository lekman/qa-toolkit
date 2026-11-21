package com.lekman.qualify.internal.execution;

import com.lekman.qualify.Assertion;
import com.lekman.qualify.AttachmentTooLarge;
import com.lekman.qualify.Check;
import com.lekman.qualify.CheckFailed;
import com.lekman.qualify.Level;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.SecretNotFound;
import com.lekman.qualify.SkipSignal;
import com.lekman.qualify.ThrowingRunnable;
import com.lekman.qualify.ThrowingSupplier;
import com.lekman.qualify.internal.redaction.Redaction;
import com.lekman.qualify.internal.redaction.SecretRegistry;
import com.lekman.qualify.internal.values.Values;
import java.io.Serializable;
import java.lang.invoke.SerializedLambda;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeSet;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * The context a qualification test receives. It records checks and attachments in memory; the
 * extension redacts and writes them when the body ends. One instance belongs to one test, but a
 * test may hand it to threads it starts, so recording is synchronised.
 */
public final class TestContext implements QualifyContext {

  private static final Pattern SECRET_NAME = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
  private static final Pattern FILENAME = Pattern.compile("^[^/\\\\]+$");

  private final Options options;
  private final List<PendingAttachment> attached = new ArrayList<>();
  private final List<CheckRecord> recorded = new ArrayList<>();
  private final TreeSet<String> secrets =
      new TreeSet<>(com.lekman.qualify.internal.json.Json.CODE_POINT_ORDER);
  private int seq;

  /**
   * What a context needs from the run and the test.
   *
   * @param id the test ID
   * @param level the level
   * @param environment the environment name
   * @param attachmentLimit the size limit in bytes
   * @param clock the current time
   * @param registry registered secret values
   * @param secretSource reads a secret by name
   * @param runContext the run's actor, source and target
   * @param site the site of the current call
   * @param warn where warnings go
   */
  public record Options(
      String id,
      Level level,
      String environment,
      long attachmentLimit,
      Supplier<Instant> clock,
      SecretRegistry registry,
      Function<String, Optional<String>> secretSource,
      Supplier<Map<String, Object>> runContext,
      Supplier<String> site,
      Consumer<String> warn) {}

  /** A context for one test. */
  public TestContext(Options options) {
    this.options = options;
  }

  @Override
  public void attach(String filename, Object body, String contentType) {
    nonEmpty(filename, "attachment filename");
    if (!FILENAME.matcher(filename).matches()) {
      throw new IllegalArgumentException(
          "attachment filename " + filename + " must not contain / or \\");
    }
    nonEmpty(contentType, "attachment content type");
    PendingAttachment pending = Attachments.pending(filename, body, contentType);
    long size = Attachments.size(pending);
    if (size > options.attachmentLimit()) {
      throw new AttachmentTooLarge(
          "attachment "
              + filename
              + " is "
              + size
              + " bytes, over the limit of "
              + options.attachmentLimit()
              + " bytes");
    }
    synchronized (this) {
      attached.add(pending);
    }
  }

  /** Attachments added so far, not yet redacted. */
  public synchronized List<PendingAttachment> attachments() {
    return List.copyOf(attached);
  }

  @Override
  public Check check(String context, String description) {
    nonEmpty(context, "check context");
    nonEmpty(description, "check description");
    return new CheckBuilder(context, description, false);
  }

  /** Checks recorded so far, in call order. */
  public synchronized List<CheckRecord> checks() {
    List<CheckRecord> sorted = new ArrayList<>(recorded);
    sorted.sort((a, b) -> Integer.compare(a.seq(), b.seq()));
    return sorted;
  }

  @Override
  public void delegate(String context, String description, ThrowingRunnable work) {
    Objects.requireNonNull(work, "delegate() takes the work to run");
    delegated(
        context,
        description,
        delegateName(work),
        () -> {
          work.run();
          return Boolean.TRUE;
        });
  }

  @Override
  public <T> T delegateValue(String context, String description, ThrowingSupplier<T> work) {
    Objects.requireNonNull(work, "delegateValue() takes the work to run");
    return delegated(context, description, delegateName(work), work);
  }

  @Override
  public Level getLevel() {
    return options.level();
  }

  @Override
  public String getEnvironment() {
    return options.environment();
  }

  @Override
  public String getId() {
    return options.id();
  }

  @Override
  public String redact(String value) {
    Objects.requireNonNull(value, "redact() takes a string");
    if (!options.registry().add(value)) {
      options
          .warn()
          .accept(
              "qualify: "
                  + options.id()
                  + ": a value shorter than "
                  + Redaction.MIN_LENGTH
                  + " characters was not registered for redaction");
    }
    return value;
  }

  @Override
  public void runContext() {
    runContext(Map.of());
  }

  @Override
  public void runContext(Map<String, ?> extra) {
    Map<String, Object> values = new LinkedHashMap<>();
    for (Map.Entry<String, ?> entry : extra.entrySet()) {
      values.put(entry.getKey(), Values.normalise(entry.getValue()));
    }
    Map<String, Object> run = options.runContext().get();
    Map<String, Object> document = new LinkedHashMap<>();
    document.put("actor", run.get("actor"));
    document.put("extra", values);
    document.put("source", run.get("source"));
    document.put("target", run.get("target"));
    attach("run-context.json", document, "application/json");
  }

  @Override
  public String secret(String name) {
    if (name == null || !SECRET_NAME.matcher(name).matches()) {
      throw new IllegalArgumentException(
          "secret name " + name + " must be letters, digits and underscores");
    }
    Optional<String> value = options.secretSource().apply(name);
    if (value.isEmpty() || value.get().isEmpty()) {
      throw new SecretNotFound(
          "secret " + name + " is not set (the default source reads QUALIFY_SECRET_" + name + ")");
    }
    synchronized (this) {
      secrets.add(name);
    }
    redact(value.get());
    return value.get();
  }

  /** Names of secrets read, sorted. */
  public synchronized List<String> secretsUsed() {
    return List.copyOf(secrets);
  }

  @Override
  public void skip(String reason) {
    nonEmpty(reason, "skip reason");
    throw new SkipSignal(reason);
  }

  /** Failed soft checks, in call order. */
  public List<CheckRecord> softFailures() {
    return checks().stream().filter(c -> c.soft() && !c.pass()).toList();
  }

  private <T> T delegated(
      String context, String description, String name, ThrowingSupplier<T> work) {
    nonEmpty(context, "delegate context");
    nonEmpty(description, "delegate description");
    int position = nextSeq();
    String site = options.site().get();
    T result;
    try {
      result = work.get();
    } catch (Throwable error) {
      String message = error.getMessage() == null ? error.toString() : error.getMessage();
      record(
          new CheckRecord(
              position,
              context,
              description,
              "delegate",
              "completes",
              message,
              false,
              false,
              site,
              name,
              now()));
      throw Outcomes.sneaky(error);
    }
    record(
        new CheckRecord(
            position,
            context,
            description,
            "delegate",
            "completes",
            "completed",
            true,
            false,
            site,
            name,
            now()));
    return result;
  }

  private static String delegateName(Serializable work) {
    try {
      Method replace = work.getClass().getDeclaredMethod("writeReplace");
      if (replace.trySetAccessible() && replace.invoke(work) instanceof SerializedLambda lambda) {
        return lambda.getImplClass().replace('/', '.') + "." + lambda.getImplMethodName();
      }
    } catch (ReflectiveOperationException | RuntimeException e) {
      // Not a serializable lambda: the class name below names the work.
    }
    return work.getClass().getName();
  }

  private static void nonEmpty(@Nullable String value, String what) {
    if (value == null || value.isEmpty()) {
      throw new IllegalArgumentException(what + " must be a non-empty string");
    }
  }

  private synchronized int nextSeq() {
    return seq++;
  }

  private String now() {
    return Values.timestamp(options.clock().get());
  }

  private synchronized void record(CheckRecord check) {
    recorded.add(check);
  }

  private boolean run(
      String context,
      String description,
      boolean soft,
      String matcher,
      Matchers.Result result,
      int position,
      String site) {
    record(
        new CheckRecord(
            position,
            context,
            description,
            matcher,
            result.expected(),
            result.actual(),
            result.pass(),
            soft,
            site,
            null,
            now()));
    if (!result.pass() && !soft) {
      throw new CheckFailed(context + ": " + description, site);
    }
    return result.pass();
  }

  private final class CheckBuilder implements Check {
    private final String context;
    private final String description;
    private final boolean soft;

    CheckBuilder(String context, String description, boolean soft) {
      this.context = context;
      this.description = description;
      this.soft = soft;
    }

    @Override
    public Check soft() {
      return new CheckBuilder(context, description, true);
    }

    @Override
    public Assertion that(Object actual) {
      return new Matching(context, description, soft, actual);
    }
  }

  private final class Matching implements Assertion {
    private final String context;
    private final String description;
    private final boolean soft;
    private final Object actual;

    Matching(String context, String description, boolean soft, Object actual) {
      this.context = context;
      this.description = description;
      this.soft = soft;
      this.actual = actual;
    }

    @Override
    public boolean contains(Object expected) {
      return evaluate("contains", () -> Matchers.contains(actual, expected));
    }

    @Override
    public boolean hasLength(int length) {
      return evaluate("hasLength", () -> Matchers.hasLength(actual, length));
    }

    @Override
    public boolean isAtLeast(Number bound) {
      return evaluate("atLeast", () -> Matchers.bound("atLeast", actual, bound));
    }

    @Override
    public boolean isAtMost(Number bound) {
      return evaluate("atMost", () -> Matchers.bound("atMost", actual, bound));
    }

    @Override
    public boolean isEqualTo(Object expected) {
      return evaluate("equals", () -> Matchers.equality("equals", actual, expected));
    }

    @Override
    public boolean isFalse() {
      return evaluate("isFalse", () -> Matchers.state("isFalse", actual));
    }

    @Override
    public boolean isNotEqualTo(Object expected) {
      return evaluate("notEquals", () -> Matchers.equality("notEquals", actual, expected));
    }

    @Override
    public boolean isNotNull() {
      return evaluate("isNotNull", () -> Matchers.state("isNotNull", actual));
    }

    @Override
    public boolean isNull() {
      return evaluate("isNull", () -> Matchers.state("isNull", actual));
    }

    @Override
    public boolean isOneOf(Collection<?> values) {
      return evaluate("oneOf", () -> Matchers.oneOf(actual, values));
    }

    @Override
    public boolean isOneOf(Object... values) {
      return evaluate(
          "oneOf", () -> Matchers.oneOf(actual, values == null ? null : Arrays.asList(values)));
    }

    @Override
    public boolean isTrue() {
      return evaluate("isTrue", () -> Matchers.state("isTrue", actual));
    }

    @Override
    public boolean matches(Pattern pattern) {
      return evaluate("matches", () -> Matchers.matches(actual, pattern));
    }

    @Override
    public boolean matches(String regex) {
      return evaluate(
          "matches", () -> Matchers.matches(actual, regex == null ? null : Pattern.compile(regex)));
    }

    private boolean evaluate(String matcher, Supplier<Matchers.Result> evaluation) {
      int position = nextSeq();
      String site = options.site().get();
      return run(context, description, soft, matcher, evaluation.get(), position, site);
    }
  }
}
