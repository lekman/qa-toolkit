package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 7, {@code policy-skip}. */
class PolicySkipTest {
  @OQ(
      id = "OQ-CONF-007",
      title = "policy-skip test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ_WRITE)
  void policySkip(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
  }
}
