package com.lekman.qualify;

/**
 * A failed check: thrown by a hard check at once, and at the end of the body when any soft check
 * failed. The outcome is {@code fail}. It is an {@link AssertionError}, so JUnit and IDEs report it
 * as a test failure.
 */
public class CheckFailed extends AssertionError {

  private static final long serialVersionUID = 1L;

  private final String site;

  /**
   * A failed check.
   *
   * @param message {@code <context>: <description>}, or {@code <n> soft check(s) failed}
   * @param site the {@code path:line} of the failing check
   */
  public CheckFailed(String message, String site) {
    super(message);
    this.site = site;
  }

  /** The {@code path:line} of the failing check. */
  public String getSite() {
    return site;
  }
}
