package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 2, {@code failing-check-stops}. */
class FailingCheckStopsTest {
  @OQ(
      id = "OQ-CONF-002",
      title = "failing-check-stops test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void failingCheckStops(QualifyContext ctx) {
    ctx.check("fixture", "first passes").that(1).isEqualTo(1);
    ctx.check("fixture", "second fails").that(2).isEqualTo(3);
    ctx.check("fixture", "third never runs").that(4).isEqualTo(4);
  }
}
