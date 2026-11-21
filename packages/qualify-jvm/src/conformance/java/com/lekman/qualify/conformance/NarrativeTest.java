package com.lekman.qualify.conformance;

import com.lekman.qualify.PQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/** Scenario 13, {@code narrative}: every string survives byte for byte. */
class NarrativeTest {
  @PQ(
      id = "PQ-CONF-014",
      title = "narrative test",
      given = "données d’entrée — 入力",
      when = "the run 🚀 starts",
      then = "“quoted” output",
      and = {"first", "second", "third — 3"},
      scope = Scope.READ)
  void narrative(QualifyContext ctx) {
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
  }
}
