package com.lekman.qualify.internal.execution;

import com.lekman.qualify.ConfigurationError;
import com.lekman.qualify.QualifyConfiguration;
import com.lekman.qualify.internal.envelope.Envelope;
import com.lekman.qualify.internal.envelope.GitFacts;
import com.lekman.qualify.internal.redaction.Redaction;
import com.lekman.qualify.internal.redaction.SecretRegistry;
import com.lekman.qualify.internal.settings.Policy;
import com.lekman.qualify.internal.settings.Settings;
import com.lekman.qualify.internal.settings.SettingsResolver;
import com.lekman.qualify.internal.site.Sites;
import com.lekman.qualify.internal.ulid.Ulid;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;

/**
 * What every qualification test of one launcher session shares: the settings, the run envelope, the
 * registered secrets and where evidence goes.
 *
 * @param settings the resolved settings
 * @param run the run envelope, pattern rules applied
 * @param evidenceDir the evidence directory, absolute
 * @param registry values registered for redaction
 * @param sites resolves sites
 * @param clock the current time
 * @param warn where warnings go
 */
public record Session(
    Settings settings,
    Map<String, Object> run,
    Path evidenceDir,
    SecretRegistry registry,
    Sites sites,
    Supplier<Instant> clock,
    Consumer<String> warn) {

  /**
   * Everything a session is built from.
   *
   * @param env the environment variables
   * @param config the JUnit configuration parameters
   * @param workingDirectory where the tests run
   * @param git what git says about it
   * @param tool the tool object of the envelope
   * @param clock the current time
   * @param warn where warnings go
   */
  public record Inputs(
      Map<String, String> env,
      Function<String, Optional<String>> config,
      Path workingDirectory,
      GitFacts git,
      Map<String, Object> tool,
      Supplier<Instant> clock,
      Consumer<String> warn) {}

  /**
   * Build a session. The run ID comes from {@code QUALIFY_RUN_ID} (or {@code qualify.runId});
   * without one, a new ULID names the session's run.
   */
  public static Session create(Inputs inputs) {
    QualifyConfiguration project = project(inputs.config());
    Settings settings = SettingsResolver.resolve(inputs.env(), inputs.config(), project);
    Optional<String> given =
        SettingsResolver.setting(inputs.env(), inputs.config(), "QUALIFY_RUN_ID", "qualify.runId")
            .map(String::trim);
    if (given.isPresent() && !Ulid.isValid(given.get())) {
      throw new ConfigurationError("QUALIFY_RUN_ID must be a ULID, got " + given.get());
    }
    String runId = given.orElseGet(() -> Ulid.next(inputs.clock().get().toEpochMilli()));
    Map<String, Object> run =
        Redaction.object(
            Envelope.build(
                runId,
                settings.environment(),
                inputs.tool(),
                inputs.git(),
                inputs.env(),
                Policy.info(settings)),
            List.of());
    List<String> roots =
        inputs
            .config()
            .apply("qualify.sourceRoots")
            .map(
                v ->
                    Arrays.stream(v.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toList())
            .orElse(List.of());
    String gitRoot = inputs.git().root();
    Sites sites =
        new Sites(inputs.workingDirectory(), gitRoot == null ? null : Path.of(gitRoot), roots);
    Path evidence =
        inputs.workingDirectory().resolve(settings.evidenceDir()).toAbsolutePath().normalize();
    return new Session(
        settings, run, evidence, new SecretRegistry(), sites, inputs.clock(), inputs.warn());
  }

  /** The run ID. */
  public String runId() {
    return String.valueOf(run.get("id"));
  }

  private static @Nullable QualifyConfiguration project(Function<String, Optional<String>> config) {
    Optional<String> name =
        config.apply("qualify.configuration").map(String::trim).filter(s -> !s.isEmpty());
    if (name.isEmpty()) {
      return null;
    }
    try {
      Class<?> type =
          Class.forName(name.get(), true, Thread.currentThread().getContextClassLoader());
      return (QualifyConfiguration) type.getDeclaredConstructor().newInstance();
    } catch (ReflectiveOperationException | ClassCastException | LinkageError e) {
      throw new ConfigurationError(
          "qualify.configuration names "
              + name.get()
              + ", which is not a QualifyConfiguration with a public "
              + "no-argument constructor: "
              + e);
    }
  }
}
