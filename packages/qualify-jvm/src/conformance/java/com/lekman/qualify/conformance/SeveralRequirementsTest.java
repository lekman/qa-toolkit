package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.Scope;

/** Scenario 12, {@code several-requirements}. */
class SeveralRequirementsTest {
  @OQ(
      id = "OQ-CONF-013",
      title = "several-requirements test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ,
      requirements = {"REQ-1", "REQ-2"})
  void severalRequirements() {
    // The scenario declares requirements and no check.
  }
}
