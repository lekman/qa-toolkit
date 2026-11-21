package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 6, {@code runtime-skip}. */
class RuntimeSkipTest {
  @OQ(
      id = "OQ-CONF-006",
      title = "runtime-skip test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void runtimeSkip(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
    ctx.skip("fixture not seeded");
  }
}
