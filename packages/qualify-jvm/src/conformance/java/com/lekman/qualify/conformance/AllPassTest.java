package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.IQ;
import com.lekman.qualify.QualifyContext;

/** Scenario 1, {@code all-pass}. */
class AllPassTest {
  @IQ(id = "IQ-CONF-001", title = "all-pass test", given = GIVEN, when = WHEN, then = THEN)
  void allPass(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
    ctx.check("fixture", "text contains a word").that("qualify").contains("ali");
  }
}
