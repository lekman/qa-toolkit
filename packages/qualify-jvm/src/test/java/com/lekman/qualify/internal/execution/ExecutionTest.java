package com.lekman.qualify.internal.execution;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.AttachmentTooLarge;
import com.lekman.qualify.CheckFailed;
import com.lekman.qualify.Level;
import com.lekman.qualify.SkipSignal;
import com.lekman.qualify.internal.redaction.SecretRegistry;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.opentest4j.TestAbortedException;

class ExecutionTest {

  private final List<String> warnings = new ArrayList<>();

  private TestContext context(long limit) {
    return new TestContext(
        new TestContext.Options(
            "OQ-EX-001",
            Level.OQ,
            "local",
            limit,
            () -> Instant.parse("2026-01-02T03:04:05.006Z"),
            new SecretRegistry(),
            name -> Optional.empty(),
            () -> Map.of("actor", Map.of(), "source", Map.of(), "target", Map.of()),
            () -> "here.java:1",
            warnings::add));
  }

  @Test
  void matchersRecordWhatTheyCompare() {
    assertTrue(Matchers.bound("atLeast", new BigDecimal("2.5"), BigInteger.TWO).pass());
    assertFalse(Matchers.bound("atMost", Double.POSITIVE_INFINITY, 3).pass());
    assertFalse(Matchers.bound("atLeast", "5", 3).pass());
    assertFalse(Matchers.bound("atLeast", Double.NaN, 3).pass());
    assertThrows(IllegalArgumentException.class, () -> Matchers.bound("atLeast", 1, Double.NaN));
    assertThrows(IllegalArgumentException.class, () -> Matchers.bound("atLeast", 1, null));
    assertTrue(Matchers.contains(new int[] {1, 2}, 2).pass());
    assertFalse(Matchers.contains(Map.of("a", 1), "a").pass());
    assertFalse(Matchers.contains(null, "a").pass());
    Matchers.Result length = Matchers.hasLength(5, 1);
    assertNull(length.actual());
    assertFalse(length.pass());
    assertThrows(IllegalArgumentException.class, () -> Matchers.hasLength("a", -1));
    assertThrows(IllegalArgumentException.class, () -> Matchers.state("isBlue", 1));
    assertFalse(Matchers.matches(5, java.util.regex.Pattern.compile("5")).pass());
    assertThrows(IllegalArgumentException.class, () -> Matchers.matches("a", null));
    assertThrows(IllegalArgumentException.class, () -> Matchers.oneOf("a", null));
    assertEquals("not null", Matchers.state("isNotNull", 1).expected());
  }

  @Test
  void outcomesFollowWhatWasThrown() {
    assertEquals("pass", Outcomes.classify(null, 0).outcome());
    assertEquals("skip", Outcomes.classify(new SkipSignal("why"), 0).outcome());
    assertEquals(
        "aborted: TestAbortedException",
        Outcomes.classify(new TestAbortedException(), 0).skipReason());
    assertEquals("fail", Outcomes.classify(new CheckFailed("c: d", "s:1"), 3).outcome());
    assertEquals("AssertionError", Outcomes.classify(new AssertionError("x"), 0).errorType());
    assertEquals("error", Outcomes.classify(new IllegalStateException("x"), 0).outcome());
    assertThrows(
        IllegalStateException.class,
        () -> {
          throw Outcomes.sneaky(new IllegalStateException("again"));
        });
  }

  @Test
  void theContextChecksItsArguments() {
    TestContext ctx = context(4);
    assertThrows(IllegalArgumentException.class, () -> ctx.check("", "d"));
    assertThrows(IllegalArgumentException.class, () -> ctx.attach("a/b", "x", "text/plain"));
    assertThrows(IllegalArgumentException.class, () -> ctx.attach("a", "x", ""));
    assertThrows(IllegalArgumentException.class, () -> ctx.attach("a", List.of(1), "text/plain"));
    AttachmentTooLarge large =
        assertThrows(AttachmentTooLarge.class, () -> ctx.attach("big.txt", "12345", "text/plain"));
    assertEquals("attachment big.txt is 5 bytes, over the limit of 4 bytes", large.getMessage());
    assertThrows(IllegalArgumentException.class, () -> ctx.secret("bad name"));
    assertThrows(IllegalArgumentException.class, () -> ctx.skip(""));
    assertThrows(SkipSignal.class, () -> ctx.skip("why"));
    assertEquals("ab", ctx.redact("ab"));
    assertEquals(1, warnings.size());
    assertThrows(NullPointerException.class, () -> ctx.delegate("c", "d", null));
  }

  @Test
  void checksAreRecordedInCallOrder() {
    TestContext ctx = context(1024);
    assertFalse(ctx.check("c", "soft").soft().that(1).isEqualTo(2));
    assertTrue(ctx.check("c", "ok").that(1).isNotNull());
    CheckFailed failed =
        assertThrows(CheckFailed.class, () -> ctx.check("c", "hard").that(null).isNotNull());
    assertEquals("here.java:1", failed.getSite());
    assertEquals(3, ctx.checks().size());
    assertEquals(1, ctx.softFailures().size());
    assertEquals("2026-01-02T03:04:05.006Z", ctx.checks().get(0).toJson().get("at"));
  }
}
