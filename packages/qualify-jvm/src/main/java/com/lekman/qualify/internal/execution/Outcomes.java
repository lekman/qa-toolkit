package com.lekman.qualify.internal.execution;

import com.lekman.qualify.CheckFailed;
import com.lekman.qualify.SkipSignal;
import com.lekman.qualify.internal.values.Values;
import org.jspecify.annotations.Nullable;
import org.opentest4j.TestAbortedException;

/** Outcome classification, section 3.3 of the specification. */
public final class Outcomes {

  private Outcomes() {}

  /**
   * How a test ended.
   *
   * @param outcome {@code pass}, {@code fail}, {@code error} or {@code skip}
   * @param skipReason the reason, for a skip
   * @param errorType the failure's type name, for a fail or error
   * @param errorMessage the failure's message, not yet redacted
   */
  public record Classification(
      String outcome,
      @Nullable String skipReason,
      @Nullable String errorType,
      @Nullable String errorMessage) {

    /** A pass. */
    static Classification pass() {
      return new Classification("pass", null, null, null);
    }

    /** A skip with a reason. */
    public static Classification skip(String reason) {
      return new Classification("skip", reason, null, null);
    }
  }

  /**
   * Classify the end of a body: what it threw, if anything, and how many soft checks failed. A
   * thrown value decides the outcome; failed soft checks only decide it when the body completed.
   */
  public static Classification classify(@Nullable Throwable thrown, int softFailures) {
    if (thrown == null) {
      if (softFailures > 0) {
        return new Classification(
            "fail", null, "CheckFailed", softFailures + " soft check(s) failed");
      }
      return Classification.pass();
    }
    if (thrown instanceof SkipSignal skip) {
      return Classification.skip(skip.getReason());
    }
    if (thrown instanceof TestAbortedException aborted) {
      String message = aborted.getMessage();
      return Classification.skip(
          message == null || message.isBlank() ? "aborted: " + Values.typeName(aborted) : message);
    }
    if (thrown instanceof CheckFailed failed) {
      return new Classification("fail", null, "CheckFailed", messageOf(failed));
    }
    String outcome = thrown instanceof AssertionError ? "fail" : "error";
    return new Classification(outcome, null, Values.typeName(thrown), messageOf(thrown));
  }

  /** A throwable's message, or an empty string when it has none. */
  public static String messageOf(Throwable error) {
    String message = error.getMessage();
    return message == null ? "" : message;
  }

  /** Rethrow any throwable without declaring it. */
  public static RuntimeException sneaky(Throwable error) {
    Outcomes.<RuntimeException>raise(error);
    throw new AssertionError("unreachable");
  }

  @SuppressWarnings("unchecked")
  private static <E extends Throwable> void raise(Throwable error) throws E {
    throw (E) error;
  }
}
