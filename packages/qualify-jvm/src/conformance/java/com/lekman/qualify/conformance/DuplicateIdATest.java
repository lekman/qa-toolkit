package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.Scope;

/** Scenario 17, {@code duplicate-id}: one of two files declaring OQ-CONF-018. */
class DuplicateIdATest {
  @OQ(
      id = "OQ-CONF-018",
      title = "duplicate-id test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void duplicate() {
    // The scenario declares the ID twice and no check.
  }
}
