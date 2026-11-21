package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 9, {@code bad-id}: an ID in lower case, and an IQ ID declared as OQ. */
class BadIdTest {
  @OQ(
      id = "OQ-conf-009",
      title = "bad-id test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void lowerCase(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
  }

  @OQ(
      id = "IQ-CONF-010",
      title = "bad-id test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void wrongLevel(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
  }
}
