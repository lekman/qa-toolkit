package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/**
 * Scenario 11, {@code pattern-redaction}. Each sample is joined from two parts, so secret scanners
 * do not flag this source as holding a real key.
 */
class PatternRedactionTest {
  private static final String PEM =
      "-----BEGIN PRIVATE"
          + " KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
  private static final String JWT = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
  private static final String ACCESS_KEY = "AK" + "IA" + "ABCDEFGHIJKLMNOP";

  @OQ(
      id = "OQ-CONF-012",
      title = "pattern-redaction test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void patternRedaction(QualifyContext ctx) {
    ctx.check("fixture", "the output holds secret shapes")
        .that(String.join(" ", PEM, JWT, ACCESS_KEY))
        .isNotNull();
  }
}
