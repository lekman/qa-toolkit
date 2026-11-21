package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Scenario 15, {@code value-normalisation}: each value compared with itself. */
class ValueNormalisationTest {
  @OQ(
      id = "OQ-CONF-017",
      title = "value-normalisation test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void valueNormalisation(QualifyContext ctx) {
    byte[] bytes = {0x01, 0x02};
    Instant instant = Instant.parse("2026-01-02T03:04:05.006Z");
    long big = 1L << 60;
    double nan = Double.NaN;
    Map<String, Object> map = Map.of("b", 1, "a", Map.of("d", 2, "c", 3));
    Set<String> set = Set.of("b", "a");
    List<Object> cycle = new ArrayList<>();
    cycle.add(cycle);

    ctx.check("value", "bytes").that(bytes).isEqualTo(bytes);
    ctx.check("value", "instant").that(instant).isEqualTo(instant);
    ctx.check("value", "big integer").that(big).isEqualTo(big);
    ctx.check("value", "NaN").that(nan).isEqualTo(nan);
    ctx.check("value", "map").that(map).isEqualTo(map);
    ctx.check("value", "set").that(set).isEqualTo(set);
    ctx.check("value", "cycle").that(cycle).isEqualTo(cycle);
  }
}
