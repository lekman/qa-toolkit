package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;

/** Scenario 8, {@code missing-scope}: an OQ test without a scope. */
class MissingScopeTest {
  @OQ(id = "OQ-CONF-008", title = "missing-scope test", given = GIVEN, when = WHEN, then = THEN)
  void missingScope(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
  }
}
