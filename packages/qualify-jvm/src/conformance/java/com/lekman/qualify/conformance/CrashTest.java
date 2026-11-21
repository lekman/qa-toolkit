package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.Scope;

/** Scenario 18, {@code crash}: the test JVM stops mid-test, after the marker is written. */
class CrashTest {
  @OQ(
      id = "OQ-CONF-019",
      title = "crash test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void crash() {
    // halt stops the JVM at once: no shutdown hook, no after-execution callback.
    Runtime.getRuntime().halt(137);
  }
}
