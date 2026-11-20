package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.Scope;

/** Scenario 19, {@code deselected}: the harness selects only OQ-CONF-020. */
class DeselectedTest {
  @OQ(
      id = "OQ-CONF-020",
      title = "deselected test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void selected() {
    // The scenario declares no check.
  }

  @OQ(
      id = "OQ-CONF-021",
      title = "deselected test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void deselected() {
    // Never selected.
  }
}
