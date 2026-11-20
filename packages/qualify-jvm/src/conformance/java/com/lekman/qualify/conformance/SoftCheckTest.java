package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 3, {@code soft-check}. */
class SoftCheckTest {
  @OQ(
      id = "OQ-CONF-003",
      title = "soft-check test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void softCheck(QualifyContext ctx) {
    ctx.check("fixture", "soft fails").soft().that("a").isEqualTo("b");
    ctx.check("fixture", "still runs").that(true).isTrue();
  }
}
