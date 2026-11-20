package com.lekman.qualify.internal.trace;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TraceTest {

  private static Map<String, Object> test(
      String id, String outcome, List<String> requirements, String controls) {
    Map<String, Object> test = new LinkedHashMap<>();
    test.put("id", id);
    test.put("level", id.substring(0, 2));
    test.put("title", id + " title");
    test.put("requirements", requirements);
    test.put("outcome", outcome);
    if (controls != null) {
      test.put("controls", controls);
    }
    return test;
  }

  private static Map<String, Object> run(List<Object> tests) {
    Map<String, Object> file = new LinkedHashMap<>();
    file.put("run", Map.of("id", "RUN"));
    file.put("tests", tests);
    return file;
  }

  @Test
  void linksComeFromCodeProtocolAndMap() {
    List<Object> tests = new ArrayList<>();
    tests.add(test("OQ-TR-002", "pass", List.of("R-1"), "OQ-TR-001"));
    tests.add(test("OQ-TR-001", "fail", List.of("R-1"), null));
    tests.add(test("OQ-TR-003", "skip", List.of(), null));
    List<ProtocolEntry> protocol =
        TraceInputs.protocol(
            """
            tests:
              - {id: OQ-TR-001, title: one, level: OQ, requirements: [R-2], risk: high}
              - {id: OQ-TR-009, title: absent, level: OQ, requirements: R-9}
            """,
            "p.yaml");
    Map<String, List<String>> map = TraceInputs.map("OQ-TR-001: [R-1, R-3]\n", "m.yaml");
    Trace trace = Trace.build(run(tests), protocol, map);
    List<String> rows =
        trace.rows().stream()
            .map(r -> r.requirement() + " " + r.testId() + " " + r.sources())
            .toList();
    assertEquals(
        List.of(
            "R-1 OQ-TR-001 [code, map]",
            "R-1 OQ-TR-002 [code]",
            "R-2 OQ-TR-001 [protocol]",
            "R-3 OQ-TR-001 [map]",
            "R-9 OQ-TR-009 [protocol]",
            "null OQ-TR-003 []"),
        rows);
    assertEquals("high", trace.rows().get(0).risk());
    assertEquals(List.of("OQ-TR-009"), trace.notRun());
    assertEquals(List.of("R-2", "R-3", "R-9"), trace.requirementsWithoutPass());
  }

  @Test
  void badInputsAreRefused() {
    assertEquals(Map.of(), TraceInputs.map("", "m"));
    assertThrows(TraceInputError.class, () -> TraceInputs.map("- a", "m"));
    assertThrows(TraceInputError.class, () -> TraceInputs.map("nope: R", "m"));
    assertThrows(TraceInputError.class, () -> TraceInputs.map("OQ-TR-001: [R, R]", "m"));
    assertThrows(TraceInputError.class, () -> TraceInputs.map("OQ-TR-001: {a: 1}", "m"));
    assertThrows(TraceInputError.class, () -> TraceInputs.map("OQ-TR-001: [1]", "m"));
    assertThrows(TraceInputError.class, () -> TraceInputs.map("a: [", "m"));
    for (String bad :
        List.of(
            "x: 1",
            "tests: [1]",
            "tests: [{id: OQ-TR-001, title: t, level: OQ, extra: 1}]",
            "tests: [{id: bad, title: t, level: OQ}]",
            "tests: [{id: OQ-TR-001, title: t, level: PQ}]",
            "tests: [{id: OQ-TR-001, title: ' ', level: OQ}]",
            "tests: [{id: OQ-TR-001, title: t, level: OQ, risk: huge}]",
            "tests: [{id: OQ-TR-001, title: t, level: OQ}, {id: OQ-TR-001, title: t, level: OQ}]")) {
      TraceInputError error =
          assertThrows(TraceInputError.class, () -> TraceInputs.protocol(bad, "p"), bad);
      assertTrue(error.getMessage().startsWith("p"));
    }
  }
}
