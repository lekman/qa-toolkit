package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 4, {@code thrown-error}. */
class ThrownErrorTest {
  @OQ(
      id = "OQ-CONF-004",
      title = "thrown-error test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void thrownError(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
    throw new IllegalStateException("boom");
  }
}
