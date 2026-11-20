package com.lekman.qualify.fixtures;

import com.lekman.qualify.IQ;
import com.lekman.qualify.IU;
import com.lekman.qualify.NotApplicableRule;
import com.lekman.qualify.OQ;
import com.lekman.qualify.PQ;
import com.lekman.qualify.QualifyConfiguration;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Risk;
import com.lekman.qualify.Scope;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Test classes the extension tests run through the JUnit testkit. Gradle never discovers them on
 * their own.
 */
public final class Fixtures {

  private static final String G = "a fixture";
  private static final String W = "the test runs";
  private static final String T = "the record says so";

  private Fixtures() {}

  /** Every level, every matcher, and the optional fields. */
  public static class Passing {
    @IQ(
        id = "IQ-FIX-001",
        title = "install",
        given = G,
        when = W,
        then = T,
        and = {"first", "second"},
        requirements = {"REQ-1"},
        risk = Risk.HIGH,
        tags = {"zeta", "alpha", "alpha"})
    @Tag("smoke")
    void install(QualifyContext ctx) {
      ctx.check("matchers", "equals").that(1).isEqualTo(1L);
      ctx.check("matchers", "not equals").that("a").isNotEqualTo("b");
      ctx.check("matchers", "contains element").that(List.of(1, 2)).contains(2);
      ctx.check("matchers", "matches text").that("abc-123").matches("\\d+");
      ctx.check("matchers", "is false").that(false).isFalse();
      ctx.check("matchers", "is null").that(null).isNull();
      ctx.check("matchers", "has length").that("ab🚀").hasLength(3);
      ctx.check("matchers", "at least").that(5).isAtLeast(5);
      ctx.check("matchers", "at most").that(2.5).isAtMost(3);
      ctx.check("matchers", "one of").that("b").isOneOf("a", "b");
      ctx.check("matchers", "one of list").that(1).isOneOf(List.of(1, 2));
      ctx.check("matchers", "pattern").that("x").matches(java.util.regex.Pattern.compile("x"));
      int value = ctx.delegateValue("helper", "returns a value", () -> 41 + 1);
      ctx.check("matchers", "delegate value").that(value).isEqualTo(42);
      ctx.check("identity", "id").that(ctx.getId()).isEqualTo("IQ-FIX-001");
      ctx.check("identity", "level").that(ctx.getLevel().name()).isEqualTo("IQ");
      ctx.check("identity", "environment").that(ctx.getEnvironment()).isEqualTo("local");
    }

    @OQ(
        id = "OQ-FIX-002",
        title = "operate",
        given = G,
        when = W,
        then = T,
        scope = Scope.READ,
        controls = "OQ-FIX-099")
    void operate(QualifyContext ctx) {
      ctx.attach("note.txt", "hello\n", "text/plain");
      ctx.attach("data.json", "{\"b\": 1, \"a\": [true, null]}", "application/json; charset=utf-8");
      ctx.attach("broken.json", "{not json", "application/json");
      ctx.attach("map.json", Map.of("password", "x", "ok", 1), "application/json");
      ctx.runContext(Map.of("build", 7));
      ctx.redact("short");
    }

    @PQ(id = "PQ-FIX-003", title = "perform", given = G, when = W, then = T, scope = Scope.READ)
    void perform() {
      // A test may take no context.
    }

    @IU(id = "IU-FIX-004", title = "use", given = G, when = W, then = T)
    void use(QualifyContext ctx) {
      ctx.runContext();
    }
  }

  /** Failures of every kind. */
  public static class Failing {
    @OQ(id = "OQ-FIX-010", title = "hard", given = G, when = W, then = T, scope = Scope.READ)
    void hard(QualifyContext ctx) {
      ctx.check("fixture", "fails").that(1).isEqualTo(2);
    }

    @OQ(id = "OQ-FIX-011", title = "soft", given = G, when = W, then = T, scope = Scope.READ)
    void soft(QualifyContext ctx) {
      ctx.check("fixture", "first soft").soft().that("a").isEqualTo("b");
      ctx.check("fixture", "second soft").soft().that(1).isAtLeast(2);
    }

    @OQ(id = "OQ-FIX-012", title = "error", given = G, when = W, then = T, scope = Scope.READ)
    void error() {
      throw new UnsupportedOperationException();
    }

    @OQ(id = "OQ-FIX-013", title = "assumption", given = G, when = W, then = T, scope = Scope.READ)
    void assumption() {
      Assumptions.assumeTrue(false, "not on this machine");
    }

    @OQ(id = "OQ-FIX-014", title = "delegate", given = G, when = W, then = T, scope = Scope.READ)
    void delegate(QualifyContext ctx) {
      ctx.delegate(
          "helper",
          "throws",
          () -> {
            throw new IllegalArgumentException("bad input");
          });
    }

    @OQ(id = "OQ-FIX-015", title = "secret", given = G, when = W, then = T, scope = Scope.READ)
    void secret(QualifyContext ctx) {
      String value = ctx.secret("FIXTURE_TOKEN");
      throw new IllegalStateException("leaked " + value, new RuntimeException("cause " + value));
    }

    @OQ(
        id = "OQ-FIX-016",
        title = "secret check",
        given = G,
        when = W,
        then = T,
        scope = Scope.READ)
    void secretCheck(QualifyContext ctx) {
      String value = ctx.secret("FIXTURE_TOKEN");
      ctx.check("api", "uses " + value).that(value).isEqualTo("other");
    }

    @OQ(
        id = "OQ-FIX-017",
        title = "missing secret",
        given = G,
        when = W,
        then = T,
        scope = Scope.READ)
    void missingSecret(QualifyContext ctx) {
      ctx.secret("NOT_SET_ANYWHERE");
    }

    @OQ(id = "OQ-FIX-018", title = "secret skip", given = G, when = W, then = T, scope = Scope.READ)
    void secretSkip(QualifyContext ctx) {
      ctx.skip("no fixture for " + ctx.secret("FIXTURE_TOKEN"));
    }

    @OQ(
        id = "OQ-FIX-019",
        title = "secret assert",
        given = G,
        when = W,
        then = T,
        scope = Scope.READ)
    void secretAssert(QualifyContext ctx) {
      throw new AssertionError("saw " + ctx.secret("FIXTURE_TOKEN"));
    }
  }

  /** A read-write test, for the policy. */
  public static class Writing {
    @OQ(
        id = "OQ-FIX-020",
        title = "writes",
        given = G,
        when = W,
        then = T,
        scope = Scope.READ_WRITE)
    void writes(QualifyContext ctx) {
      ctx.check("fixture", "ran").that(true).isTrue();
    }

    @OQ(
        id = "OQ-FIX-021",
        title = "tagged",
        given = G,
        when = W,
        then = T,
        scope = Scope.READ,
        tags = {"slow"})
    void tagged() {
      // Matched by the not-applicable rule of the configuration below.
    }
  }

  /** Declaration errors. */
  public static class Invalid {
    @OQ(
        id = "OQ-FIX-030",
        title = "",
        given = "",
        when = " ",
        then = "",
        scope = Scope.READ,
        controls = "x")
    void empty() {
      // Never runs.
    }

    @OQ(
        id = "OQ-FIX-031",
        title = "two\nlines",
        given = G,
        when = W,
        then = T,
        scope = Scope.READ,
        and = {""},
        requirements = {"R", "R", ""},
        tags = {""},
        controls = "OQ-FIX-031")
    void self() {
      // Never runs.
    }

    @OQ(id = "OQ-FIX-032", title = "both", given = G, when = W, then = T, scope = Scope.READ)
    @PQ(id = "PQ-FIX-032", title = "both", given = G, when = W, then = T, scope = Scope.READ)
    void both() {
      // Never runs.
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    @OQ(id = "OQ-FIX-033", title = "params", given = G, when = W, then = T, scope = Scope.READ)
    void parametrised(int value) {
      // Never runs.
    }
  }

  /** A project configuration: environment, secrets and a not-applicable rule. */
  public static class Project implements QualifyConfiguration {
    @Override
    public Optional<String> environment() {
      return Optional.of("staging");
    }

    @Override
    public List<NotApplicableRule> notApplicable() {
      return List.of(
          new NotApplicableRule("slow tests do not run here", List.of("slow"), List.of("staging")));
    }

    @Override
    public Optional<String> secret(String name) {
      return name.equals("FIXTURE_TOKEN") ? Optional.of("fixture-token-value") : Optional.empty();
    }
  }

  /** A resolver that fails, so the environment is production. */
  public static class Broken implements QualifyConfiguration {
    @Override
    public Optional<String> environment() {
      throw new IllegalStateException("no environment");
    }
  }
}
