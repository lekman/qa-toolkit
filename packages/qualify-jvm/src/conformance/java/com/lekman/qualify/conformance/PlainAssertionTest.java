package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 5, {@code plain-assertion}. The harness runs it with assertions on ({@code -ea}). */
class PlainAssertionTest {

  /** A helper shared with unit tests, using Java's own assertion. */
  static void sharedHelper() {
    int sum = Integer.parseInt("2");
    assert sum == 3 : "helper failed";
  }

  @OQ(
      id = "OQ-CONF-005",
      title = "plain-assertion test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void plainAssertion(QualifyContext ctx) {
    ctx.delegate("helper", "shared helper passes", PlainAssertionTest::sharedHelper);
  }
}
