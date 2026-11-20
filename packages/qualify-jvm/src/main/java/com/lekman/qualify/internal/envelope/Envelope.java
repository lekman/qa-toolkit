package com.lekman.qualify.internal.envelope;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/** Builds the run envelope of section 6.4 of the specification from facts the caller gathered. */
public final class Envelope {

  private static final Pattern COMMIT = Pattern.compile("^[0-9a-f]{40}$");
  private static final String TARGET_PREFIX = "QUALIFY_TARGET_";

  private Envelope() {}

  /**
   * Who ran the tests. On GitHub Actions the actor and the run's URL; outside CI the user name from
   * {@code USER} or {@code USERNAME}.
   */
  public static Map<String, Object> actor(Map<String, String> env) {
    Map<String, Object> actor = new LinkedHashMap<>();
    if ("true".equals(env.get("GITHUB_ACTIONS"))) {
      String server = value(env.get("GITHUB_SERVER_URL"));
      String repository = value(env.get("GITHUB_REPOSITORY"));
      String runId = value(env.get("GITHUB_RUN_ID"));
      actor.put("name", value(env.get("GITHUB_ACTOR")));
      actor.put("ci", "github-actions");
      actor.put(
          "ciRunUrl",
          server != null && repository != null && runId != null
              ? server + "/" + repository + "/actions/runs/" + runId
              : null);
      return actor;
    }
    String name = value(env.get("USER"));
    actor.put("name", name != null ? name : value(env.get("USERNAME")));
    actor.put("ci", null);
    actor.put("ciRunUrl", null);
    return actor;
  }

  /**
   * The full envelope, in schema order.
   *
   * @param runId the run ID
   * @param environment the environment name
   * @param tool the tool object
   * @param git what git says
   * @param env the environment variables
   * @param policy the policy object
   */
  public static Map<String, Object> build(
      String runId,
      String environment,
      Map<String, Object> tool,
      GitFacts git,
      Map<String, String> env,
      Map<String, Object> policy) {
    Map<String, Object> run = new LinkedHashMap<>();
    run.put("id", runId);
    run.put("environment", environment);
    run.put("tool", tool);
    run.put("source", source(git, env));
    run.put("actor", actor(env));
    run.put("target", target(env));
    run.put("policy", policy);
    return run;
  }

  /**
   * The code under test. A detached head, as CI checks out, takes the branch from {@code
   * GITHUB_HEAD_REF} or {@code GITHUB_REF_NAME} on GitHub Actions.
   */
  public static Map<String, Object> source(GitFacts git, Map<String, String> env) {
    String commit =
        git.commit() != null && COMMIT.matcher(git.commit()).matches() ? git.commit() : null;
    String branch = value(git.branch());
    if (branch == null && git.commit() != null && "true".equals(env.get("GITHUB_ACTIONS"))) {
      branch = value(env.get("GITHUB_HEAD_REF"));
      if (branch == null) {
        branch = value(env.get("GITHUB_REF_NAME"));
      }
    }
    Map<String, Object> source = new LinkedHashMap<>();
    source.put("commit", commit);
    source.put("branch", branch);
    source.put("dirty", git.dirty());
    return source;
  }

  /**
   * Declared facts about the target: {@code QUALIFY_TARGET_<NAME>} becomes {@code target.<name>},
   * lower-cased. A variable set but empty becomes null.
   */
  public static Map<String, Object> target(Map<String, String> env) {
    Map<String, Object> target = new TreeMap<>();
    for (Map.Entry<String, String> entry : env.entrySet()) {
      String name = entry.getKey();
      if (!name.startsWith(TARGET_PREFIX) || name.length() == TARGET_PREFIX.length()) {
        continue;
      }
      target.put(
          name.substring(TARGET_PREFIX.length()).toLowerCase(java.util.Locale.ROOT),
          value(entry.getValue()));
    }
    return new LinkedHashMap<>(target);
  }

  private static @Nullable String value(@Nullable String text) {
    return text == null || text.isEmpty() ? null : text;
  }
}
