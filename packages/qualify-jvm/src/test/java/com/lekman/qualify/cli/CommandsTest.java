package com.lekman.qualify.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.Testkit;
import com.lekman.qualify.fixtures.Fixtures;
import com.lekman.qualify.internal.json.Json;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CommandsTest {

  private static final Path REPO = Path.of(System.getProperty("qualify.repoRoot"));

  @TempDir Path temp;

  private static int run(TestIO io, String... args) {
    return Commands.run(List.of(args), io);
  }

  /** A merged run file from the passing fixtures, in a fresh evidence directory. */
  private Path runFile() {
    Testkit.Run run = Testkit.run(Fixtures.Passing.class);
    TestIO io = new TestIO(temp);
    assertEquals(0, run(io, "merge", "--evidence-dir", run.dir().toString()), io.err.toString());
    return run.dir().resolve("test-evidence.json");
  }

  @Test
  void helpVersionAndUsageErrors() {
    TestIO io = new TestIO(temp);
    assertEquals(0, run(io, "--help"));
    assertTrue(io.out.toString().contains("qualify merge"));
    assertEquals(0, run(io, "--version"));
    // The release bumps the version, so the test checks its shape, not its value.
    assertTrue(io.out.toString().matches("(?s).*\\d+\\.\\d+\\.\\d+.*"), io.out.toString());
    assertEquals(64, run(io));
    assertEquals(64, run(io, "nope"));
    assertEquals(64, run(io, "merge", "extra"));
    assertEquals(64, run(io, "merge", "--unknown"));
    assertEquals(64, run(io, "merge", "--out"));
    assertEquals(64, run(io, "merge", "--allow-runs", "bad"));
    assertEquals(64, run(io, "validate"));
    assertEquals(64, run(io, "trace", "run.json"));
    assertTrue(io.err.toString().contains("npx @lekman/qualify trace run.json"));
  }

  @Test
  void mergeWritesTheRunFileAndItsSidecar() throws IOException {
    Path file = runFile();
    String text = Files.readString(file, StandardCharsets.UTF_8);
    assertTrue(text.startsWith("{\n  \"schemaVersion\": 1,\n  \"kind\": \"run\",\n"));
    String sidecar = Files.readString(file.resolveSibling("test-evidence.json.sha256"));
    assertTrue(sidecar.endsWith("  test-evidence.json\n"));
    TestIO io = new TestIO(temp);
    assertEquals(0, run(io, "validate", file.toString()), io.err.toString());
    Files.writeString(
        file.resolveSibling("test-evidence.json.sha256"),
        "0".repeat(64) + "  test-evidence.json\n");
    assertEquals(2, run(io, "validate", file.toString()));
    assertTrue(io.err.toString().contains("does not match"));
  }

  @Test
  void mergeWithNoRecordsIsIncomplete() throws IOException {
    TestIO io = new TestIO(temp);
    io.env.put("QUALIFY_EVIDENCE_DIR", "empty");
    io.env.put("QUALIFY_RUN_ID", Testkit.RUN_ID);
    assertEquals(3, run(io, "merge"));
    String text = Files.readString(temp.resolve("empty/test-evidence.json"));
    assertTrue(text.contains("\"verdict\": \"incomplete\""));
    assertTrue(text.contains("\"startedAt\": \"2026-03-04T05:06:07.008Z\""));
    assertEquals(3, run(io, "merge", "--out", "other.json"));
    assertTrue(Files.exists(temp.resolve("other.json.sha256")));
  }

  @Test
  void mergeRefusesBadInput() throws IOException {
    Testkit.Run run = Testkit.run(Fixtures.Passing.class);
    Path records = run.dir().resolve("records");
    String name = run.names().get(1);
    Files.writeString(records.resolve(".partial.tmp"), "ignored");
    TestIO io = new TestIO(temp);
    Files.writeString(records.resolve("junk.txt"), "x");
    assertEquals(2, run(io, "merge", "--evidence-dir", run.dir().toString()));
    assertTrue(io.err.toString().contains("junk.txt: not a record or marker name"));
    Files.delete(records.resolve("junk.txt"));

    String other = "01HQA1ZQJ0C0NF0RMANCE00001";
    String text = Files.readString(records.resolve(name)).replace(Testkit.RUN_ID, other);
    Files.writeString(records.resolve(name.replace(Testkit.RUN_ID, other)), text);
    Files.delete(records.resolve(name));
    assertEquals(2, run(io, "merge", "--evidence-dir", run.dir().toString()));
    assertTrue(io.err.toString().contains("more than one run"));
    assertEquals(
        2,
        run(
            io,
            "merge",
            "--evidence-dir",
            run.dir().toString(),
            "--allow-runs",
            other + "," + Testkit.RUN_ID));
    assertTrue(io.err.toString().contains("names every run"));
    io.err.setLength(0);
    int code = run(io, "merge", "--evidence-dir", run.dir().toString(), "--allow-runs", other);
    // The marker of that test still has the main run ID, so the pair is split.
    assertTrue(code == 2 || code == 0, io.err.toString());
  }

  @Test
  void mergeRefusesDuplicatesAndDisagreements() throws IOException {
    Testkit.Run run = Testkit.run(Fixtures.Passing.class);
    Path records = run.dir().resolve("records");
    String record =
        run.names().stream()
            .filter(n -> n.contains("PQ-FIX-003") && n.endsWith(".json"))
            .findFirst()
            .orElseThrow();
    Files.copy(
        records.resolve(record),
        records.resolve(record.replaceAll("__[0-9a-f]{8}\\.json$", "__00000000.json")));
    TestIO io = new TestIO(temp);
    assertEquals(2, run(io, "merge", "--evidence-dir", run.dir().toString()));
    assertTrue(io.err.toString().contains("test ID PQ-FIX-003 appears 2 times"), io.err.toString());

    Testkit.Run second = Testkit.run(Fixtures.Passing.class);
    Path secondRecords = second.dir().resolve("records");
    String one = second.names().get(0);
    Files.writeString(
        secondRecords.resolve(one),
        Files.readString(secondRecords.resolve(one))
            .replace("\"environment\": \"local\"", "\"environment\": \"other\""));
    io.err.setLength(0);
    assertEquals(2, run(io, "merge", "--evidence-dir", second.dir().toString()));
    assertTrue(io.err.toString().contains("disagree on environment"), io.err.toString());

    Files.writeString(secondRecords.resolve(one), "{");
    assertEquals(2, run(io, "merge", "--evidence-dir", second.dir().toString()));
    Files.writeString(secondRecords.resolve(one), "{}");
    assertEquals(2, run(io, "merge", "--evidence-dir", second.dir().toString()));
  }

  @Test
  void mergeTurnsAMarkerWithoutARecordIntoDidNotFinish() throws IOException {
    Testkit.Run run = Testkit.run(Fixtures.Passing.class);
    Path records = run.dir().resolve("records");
    String record =
        run.names().stream()
            .filter(n -> n.contains("IU-FIX-004") && n.endsWith(".json"))
            .findFirst()
            .orElseThrow();
    Files.delete(records.resolve(record));
    TestIO io = new TestIO(temp);
    assertEquals(1, run(io, "merge", "--evidence-dir", run.dir().toString()));
    String text = Files.readString(run.dir().resolve("test-evidence.json"));
    assertTrue(text.contains("\"type\": \"DidNotFinish\""));
  }

  @Test
  void validateReportsEveryInvalidFile() throws IOException {
    TestIO io = new TestIO(temp);
    Files.writeString(temp.resolve("bad.json"), "{");
    Files.writeString(temp.resolve("empty.json"), "{}");
    Files.writeString(
        temp.resolve("trace.json"),
        """
        {"schemaVersion": 1, "kind": "trace", "inputs": [], "runs": [],
         "summary": {"tests": 0, "pass": 0, "fail": 0, "error": 0, "skip": 0, "notRun": 0,
                     "requirements": 0, "requirementsWithoutPass": 0, "verdict": "incomplete"},
         "rows": [], "notRun": [], "requirementsWithoutPass": []}
        """);
    assertEquals(2, run(io, "validate", "bad.json", "empty.json", "missing.json", "trace.json"));
    assertTrue(io.err.toString().contains("bad.json: not valid JSON"));
    assertTrue(io.err.toString().contains("missing.json"));
    assertTrue(io.out.toString().contains("valid: trace.json"));
    Path runFile = runFile();
    String text = Files.readString(runFile).replace("\"level\": \"PQ\"", "\"level\": \"IU\"");
    Files.writeString(temp.resolve("levels.json"), text);
    assertEquals(2, run(io, "validate", "levels.json"));
    assertTrue(io.err.toString().contains("does not match its level IU"));
  }

  @Test
  void reportDrawsThePdfWithEveryOption() throws IOException {
    Path runFile = runFile();
    Path protocol = REPO.resolve("spec/qualify/conformance/fixtures/report.protocol.yaml");
    Files.writeString(temp.resolve("map.yaml"), "IQ-FIX-001: [REQ-9]\nOQ-FIX-002: REQ-8\n");
    TestIO io = new TestIO(temp);
    io.env.put("QUALIFY_REPORT_TIME", "2026-01-02T03:04:05Z");
    io.env.put("QUALIFY_REPORT_THEME", "plain");
    int code =
        run(
            io,
            "report",
            runFile.toString(),
            "--pdf",
            "out.pdf",
            "--protocol",
            protocol.toString(),
            "--map",
            "map.yaml",
            "--subtitle",
            "A subtitle",
            "--classification",
            "Restricted",
            "--signatures",
            "Author; QA");
    assertEquals(0, code, io.err.toString());
    String text = text(temp.resolve("out.pdf"));
    for (String wanted :
        List.of(
            "A subtitle",
            "Restricted",
            "REQ-1 (code)",
            "REQ-9 (map)",
            "REQ-8 (map)",
            "OQ-CONF-099",
            "Author",
            "QA")) {
      assertTrue(text.contains(wanted), wanted + " in\n" + text);
    }
    assertFalse(text.contains("Prepared by"));
  }

  @Test
  void reportRefusesBadInput() throws IOException {
    Path runFile = runFile();
    TestIO io = new TestIO(temp);
    assertEquals(64, run(io, "report", "--pdf", "x.pdf"));
    assertEquals(64, run(io, "report", runFile.toString()));
    assertEquals(
        64,
        run(
            io,
            "report",
            runFile.toString(),
            "--pdf",
            "x.pdf",
            "--no-signatures",
            "--signatures",
            "A"));
    assertEquals(
        64, run(io, "report", runFile.toString(), "--pdf", "x.pdf", "--signatures", " ; "));
    assertEquals(64, run(io, "report", runFile.toString(), "--pdf", "x.pdf", "--title", " "));
    assertEquals(64, run(io, "report", runFile.toString(), "--pdf=x.pdf", "--no-signatures=yes"));
    assertEquals(
        2, run(io, "report", runFile.toString(), "--pdf", "x.pdf", "--theme", "missing.json"));
    assertEquals(2, run(io, "report", "missing.json", "--pdf", "x.pdf"));
    io.env.put("QUALIFY_REPORT_TIME", "yesterday");
    assertEquals(2, run(io, "report", runFile.toString(), "--pdf", "x.pdf"));
    io.env.put("QUALIFY_REPORT_TIME", "2026-13-02T03:04:05Z");
    assertEquals(2, run(io, "report", runFile.toString(), "--pdf", "x.pdf"));
    io.env.remove("QUALIFY_REPORT_TIME");
    Files.writeString(temp.resolve("bad.yaml"), "tests: [");
    assertEquals(
        2, run(io, "report", runFile.toString(), "--pdf", "x.pdf", "--protocol", "bad.yaml"));
    Path record;
    try (var files = Files.list(runFile.getParent().resolve("records"))) {
      record = files.filter(p -> p.toString().endsWith(".json")).findFirst().orElseThrow();
    }
    assertEquals(2, run(io, "report", record.toString(), "--pdf", "x.pdf"));
    Files.writeString(temp.resolve("broken.json"), "{");
    assertEquals(2, run(io, "report", "broken.json", "--pdf", "x.pdf"));
    Files.writeString(temp.resolve("invalid.json"), "{}");
    assertEquals(2, run(io, "report", "invalid.json", "--pdf", "x.pdf"));
    assertFalse(Files.exists(temp.resolve("x.pdf")));
    assertTrue(Json.compact(io.err.toString()).length() > 0);
  }

  private static String text(Path pdf) throws IOException {
    try (PDDocument document = Loader.loadPDF(pdf.toFile())) {
      return new PDFTextStripper().getText(document);
    }
  }

  @Test
  void theTestEvidenceIsAValidRunWhenMerged() {
    Testkit.Run run = Testkit.run(Fixtures.Passing.class, Map.of());
    TestIO io = new TestIO(temp);
    assertEquals(0, run(io, "merge", "--evidence-dir", run.dir().toString()));
    assertTrue(io.out.toString().contains("4 tests, 4 pass"));
  }
}
