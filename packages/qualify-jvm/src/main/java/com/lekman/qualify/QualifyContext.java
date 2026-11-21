package com.lekman.qualify;

import java.util.Map;

/**
 * The one context a qualification test receives, as a test method parameter. It records checks,
 * attachments and secrets; qualify redacts and writes them when the test ends.
 */
public interface QualifyContext {

  /** The test ID. */
  String getId();

  /** The test level. */
  Level getLevel();

  /** The environment the test runs in. */
  String getEnvironment();

  /** Start a hard check. */
  Check check(String context, String description);

  /** Run work that has its own assertions, and record it as one {@code delegate} check. */
  void delegate(String context, String description, ThrowingRunnable work);

  /** Like {@link #delegate(String, String, ThrowingRunnable)}, returning the work's result. */
  <T> T delegateValue(String context, String description, ThrowingSupplier<T> work);

  /**
   * Add an inline attachment. The body is a {@code String}, a {@code byte[]}, or, for {@code
   * application/json}, any value qualify normalises (a map, a list, a record). An attachment over
   * the limit ends the test with {@link AttachmentTooLarge}.
   */
  void attach(String filename, Object body, String contentType);

  /**
   * Read a named secret ({@code QUALIFY_SECRET_<NAME>} by default) and register it for redaction.
   */
  String secret(String name);

  /** Register a value for redaction and return it unchanged. */
  String redact(String value);

  /** Skip the test at runtime with a reason. Throws {@link SkipSignal}; never returns. */
  void skip(String reason);

  /** Attach {@code run-context.json}: the run's source, actor and target. */
  void runContext();

  /** Attach {@code run-context.json} with extra values. */
  void runContext(Map<String, ?> extra);
}
