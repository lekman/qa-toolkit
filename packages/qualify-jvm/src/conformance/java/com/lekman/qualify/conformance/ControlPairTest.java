package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.Scope;

/** Scenario 20, {@code control-pair}: a negative test and its control. */
class ControlPairTest {
  @OQ(
      id = "OQ-CONF-022",
      title = "an unsigned call is refused",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void negative() {
    // The scenario declares no check.
  }

  @OQ(
      id = "OQ-CONF-023",
      title = "a signed call is accepted",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ,
      controls = "OQ-CONF-022")
  void control() {
    // The scenario declares no check.
  }
}
