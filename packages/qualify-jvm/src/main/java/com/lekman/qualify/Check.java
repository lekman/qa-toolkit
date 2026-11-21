package com.lekman.qualify;

/** A check being declared: {@code ctx.check(context, description)}. */
public interface Check {

  /**
   * Make this a soft check: a failure is recorded and the test continues, then fails at the end.
   */
  Check soft();

  /** The value under test. */
  Assertion that(Object actual);
}
