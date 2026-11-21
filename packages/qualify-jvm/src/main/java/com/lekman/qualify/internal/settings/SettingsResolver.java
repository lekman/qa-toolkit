package com.lekman.qualify.internal.settings;

import com.lekman.qualify.ConfigurationError;
import com.lekman.qualify.NotApplicableRule;
import com.lekman.qualify.QualifyConfiguration;
import com.lekman.qualify.internal.declaration.Declarations;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import org.jspecify.annotations.Nullable;

/**
 * Resolves the settings of section 5 of the specification. Each setting is an environment variable
 * and a JUnit configuration parameter; the environment variable wins when both are set. Pure: the
 * caller passes both sources in.
 */
public final class SettingsResolver {

  /** The attachment size limit used when none is set: 1 MiB. */
  public static final long DEFAULT_ATTACHMENT_LIMIT = 1024L * 1024L;

  /** The default evidence directory, relative to the working directory. */
  public static final String DEFAULT_EVIDENCE_DIR = "qualification/evidence";

  private static final List<String> DEFAULT_PRODUCTION = List.of("production", "prod");

  private SettingsResolver() {}

  /**
   * One setting: the environment variable when it is set and not blank, else the configuration
   * parameter.
   */
  public static Optional<String> setting(
      Map<String, String> env,
      Function<String, Optional<String>> config,
      String variable,
      String parameter) {
    String value = env.get(variable);
    if (value != null && !value.isBlank()) {
      return Optional.of(value);
    }
    return config.apply(parameter).filter(v -> !v.isBlank());
  }

  /**
   * The environment name. A project's resolver replaces the default; if it throws or returns a
   * blank name, the environment is {@code production}.
   */
  public static String environment(
      Map<String, String> env,
      Function<String, Optional<String>> config,
      @Nullable QualifyConfiguration project) {
    if (project != null) {
      try {
        Optional<String> name = project.environment();
        if (name != null && name.isPresent()) {
          return name.get().isBlank() ? "production" : name.get().trim();
        }
      } catch (RuntimeException e) {
        return "production";
      }
    }
    return setting(env, config, "QUALIFY_ENVIRONMENT", "qualify.environment")
        .map(String::trim)
        .orElse("local");
  }

  /**
   * Parse {@code QUALIFY_ALLOW_WRITE}: {@code ID=reason} pairs separated by {@code ;}. Each ID must
   * be a valid test ID and each reason non-empty.
   */
  public static List<PolicyOverride> overrides(String value) {
    List<PolicyOverride> result = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (String raw : value.split(";", -1)) {
      String entry = raw.trim();
      if (entry.isEmpty()) {
        continue;
      }
      int at = entry.indexOf('=');
      String id = at < 0 ? entry : entry.substring(0, at).trim();
      String reason = at < 0 ? "" : entry.substring(at + 1).trim();
      if (!Declarations.isTestId(id)) {
        throw new ConfigurationError(
            "QUALIFY_ALLOW_WRITE names " + id + ", which is not a test ID");
      }
      if (reason.isEmpty()) {
        throw new ConfigurationError(
            "QUALIFY_ALLOW_WRITE gives no reason for " + id + "; write " + id + "=<reason>");
      }
      if (!seen.add(id)) {
        throw new ConfigurationError("QUALIFY_ALLOW_WRITE names " + id + " twice");
      }
      result.add(new PolicyOverride(id, reason));
    }
    return result;
  }

  /** Resolve every setting. An invalid setting throws {@link ConfigurationError}. */
  public static Settings resolve(
      Map<String, String> env,
      Function<String, Optional<String>> config,
      @Nullable QualifyConfiguration project) {
    String environment = environment(env, config, project);
    List<String> production =
        setting(env, config, "QUALIFY_PRODUCTION", "qualify.production")
            .map(SettingsResolver::list)
            .orElse(DEFAULT_PRODUCTION);
    List<PolicyOverride> overrides =
        setting(env, config, "QUALIFY_ALLOW_WRITE", "qualify.allowWrite")
            .map(SettingsResolver::overrides)
            .orElse(List.of());
    boolean noOverrides =
        setting(env, config, "QUALIFY_NO_OVERRIDES", "qualify.noOverrides")
            .map(SettingsResolver::flag)
            .orElse(false);
    if (noOverrides && !overrides.isEmpty()) {
      throw new ConfigurationError(
          "QUALIFY_NO_OVERRIDES refuses every override, and QUALIFY_ALLOW_WRITE gives "
              + String.join(", ", overrides.stream().map(PolicyOverride::id).toList()));
    }
    long limit =
        setting(env, config, "QUALIFY_ATTACHMENT_LIMIT", "qualify.attachmentLimit")
            .map(SettingsResolver::limit)
            .orElse(DEFAULT_ATTACHMENT_LIMIT);
    String evidenceDir =
        setting(env, config, "QUALIFY_EVIDENCE_DIR", "qualify.evidenceDir")
            .orElse(DEFAULT_EVIDENCE_DIR);
    List<NotApplicableRule> rules =
        project == null ? List.of() : List.copyOf(project.notApplicable());
    Function<String, Optional<String>> secrets =
        project == null
            ? name -> Optional.ofNullable(env.get("QUALIFY_SECRET_" + name))
            : name -> Optional.ofNullable(project.secret(name)).flatMap(o -> o);
    return new Settings(
        limit,
        environment,
        evidenceDir,
        rules,
        overrides,
        production,
        production.contains(environment),
        secrets);
  }

  private static boolean flag(String value) {
    return Set.of("1", "true", "yes").contains(value.trim().toLowerCase(Locale.ROOT));
  }

  private static long limit(String value) {
    try {
      long limit = Long.parseLong(value.trim());
      if (limit >= 0) {
        return limit;
      }
    } catch (NumberFormatException e) {
      // Reported below with the value as given.
    }
    throw new ConfigurationError(
        "QUALIFY_ATTACHMENT_LIMIT must be a whole number of bytes, got " + value);
  }

  private static List<String> list(String value) {
    return Arrays.stream(value.split(",", -1)).map(String::trim).filter(s -> !s.isEmpty()).toList();
  }
}
