package com.lekman.qualify.conformance.harness;

import com.lekman.qualify.internal.evidence.EvidenceFiles;
import com.lekman.qualify.internal.evidence.EvidenceShape;
import com.lekman.qualify.internal.json.Json;
import com.lekman.qualify.internal.json.JsonFormatException;
import com.lekman.qualify.internal.json.Shape;
import com.lekman.qualify.internal.schema.Schemas;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Conformance harness: runs every scenario of spec/qualify/conformance/README.md through the JUnit
 * Platform launcher in a fresh JVM, then {@code merge} and {@code validate} from the CLI jar, masks
 * the run file and compares it byte for byte with the shared expected file. {@code trace} comes
 * from the TypeScript CLI ({@code packages/qualify-ts/dist/cli.js}), the only implementation of it.
 *
 * <p>It never writes an expected file. Run it with {@code ./gradlew conformance}, or {@code
 * ./gradlew conformance -Ponly=crash,all-pass}.
 */
public final class Harness {

  private static final String RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000";
  // Assembled from two parts so secret scanners do not flag the source.
  private static final String SECRET = "s3cr3t-" + "value-123";
  private static final String PACKAGE = "com.lekman.qualify.conformance.";
  private static final Pattern SITE_FILE = Pattern.compile("^(?:.*/)?([^/]+?)\\.(?:java|kt):\\d+$");
  private static final Pattern UNSERIALISABLE = Pattern.compile("\\[unserialisable: [^\\]]*\\]");

  private static final Shape TRACE =
      Shape.object(
          List.of(
              "schemaVersion",
              "kind",
              "inputs",
              "runs",
              "summary",
              "rows",
              "notRun",
              "requirementsWithoutPass"),
          Map.of(
              "inputs", Shape.items(Shape.object("path", "role", "sha256")),
              "runs", Shape.items(Shape.object("id", "environment", "commit", "verdict")),
              "summary",
                  Shape.object(
                      "tests",
                      "pass",
                      "fail",
                      "error",
                      "skip",
                      "notRun",
                      "requirements",
                      "requirementsWithoutPass",
                      "verdict"),
              "rows",
                  Shape.items(
                      Shape.object(
                          "requirement",
                          "sources",
                          "testId",
                          "level",
                          "title",
                          "risk",
                          "controls",
                          "outcome",
                          "run",
                          "environment"))));

  private final Path repo;
  private final Path expected;
  private final Path cliJar;
  private final String classpath;
  private final String java;
  private final Path tsCli;
  private final Path tsFixtures;
  private final Path fixtures;
  private Path sample;
  private Path reportRunDir;

  private Harness() {
    repo = Path.of(System.getProperty("qualify.conformance.repoRoot")).toAbsolutePath().normalize();
    expected = repo.resolve("spec/qualify/conformance/expected");
    cliJar = Path.of(System.getProperty("qualify.conformance.cliJar"));
    classpath = System.getProperty("qualify.conformance.classpath");
    java = System.getProperty("qualify.conformance.java");
    tsCli = repo.resolve("packages/qualify-ts/dist/cli.js");
    tsFixtures = repo.resolve("packages/qualify-ts/conformance/fixtures");
    fixtures = repo.resolve("spec/qualify/conformance/fixtures");
  }

  /** A scenario failed. */
  private static final class Failure extends RuntimeException {
    private static final long serialVersionUID = 1L;

    Failure(String message) {
      super(message);
    }
  }

  /** The output and exit status of a process. */
  private record Exec(int status, String output) {}

  /**
   * One launcher run of a scenario.
   *
   * @param selectors test classes or methods, without the package
   * @param env the scenario's environment variables
   * @param status the runner's expected exit status; -1 for any non-zero status
   */
  private record Invocation(List<String> selectors, Map<String, String> env, int status) {
    static Invocation of(int status, String... selectors) {
      return new Invocation(List.of(selectors), Map.of(), status);
    }

    Invocation with(Map<String, String> extra) {
      return new Invocation(selectors, extra, status);
    }
  }

  /** What a scenario's own checks can look at. */
  private record Context(Path dir, Map<String, Object> merged, String output) {}

  /** A check of a scenario beyond the expected file. */
  @FunctionalInterface
  private interface Check {
    void run(Context context) throws Exception;
  }

  /**
   * A scenario.
   *
   * @param name the scenario name
   * @param invocations the launcher runs, in order
   * @param merge the expected merge exit code, or -1 when merge is not run
   * @param trace the expected exit code of {@code trace} without inputs, or -1
   * @param expectedFile the expected file without {@code .json}, or null
   * @param errorType the placeholder for {@code error.type}, or null
   * @param sites the test classes the sites must point into
   * @param check further checks, or null
   */
  private record Scenario(
      String name,
      List<Invocation> invocations,
      int merge,
      int trace,
      String expectedFile,
      String errorType,
      List<String> sites,
      Check check) {}

  /** Run the scenarios and exit 1 when any failed. */
  public static void main(String[] args) {
    Set<String> only = null;
    Path sample = null;
    for (int i = 0; i + 1 < args.length; i += 2) {
      if (args[i].equals("--only")) {
        only = Set.of(args[i + 1].split(",", -1));
      } else if (args[i].equals("--sample")) {
        sample = Path.of(args[i + 1]);
      }
    }
    Harness harness = new Harness();
    harness.sample = sample;
    harness.runAll(only);
  }

  private void runAll(Set<String> only) {
    List<String[]> results = new ArrayList<>();
    for (Scenario scenario : scenarios()) {
      if (only != null && !only.contains(scenario.name().replaceAll("\\.[ab]$", ""))) {
        continue;
      }
      results.add(attempt(scenario.name(), () -> runScenario(scenario)));
    }
    if (only == null || only.contains("parallel-determinism")) {
      results.add(attempt("parallel-determinism", this::runParallel));
    }
    if (only == null || only.contains("shared-run-id")) {
      results.add(attempt("shared-run-id", this::runSharedRunId));
    }
    if (only == null || only.contains("report")) {
      results.add(attempt("report", this::runReport));
    }
    if (only == null || only.contains("report-theme")) {
      results.add(attempt("report-theme", this::runReportTheme));
    }
    int width = results.stream().mapToInt(r -> r[0].length()).max().orElse(0);
    int failed = 0;
    for (String[] result : results) {
      String name = String.format("%-" + width + "s", result[0]);
      if (result[1] == null) {
        System.out.println("pass  " + name);
      } else {
        failed++;
        System.out.println("FAIL  " + name + "\n      " + result[1].replace("\n", "\n      "));
      }
    }
    if (reportRunDir != null) {
      delete(reportRunDir);
    }
    System.out.printf("%n%d passed, %d failed%n", results.size() - failed, failed);
    System.exit(failed == 0 ? 0 : 1);
  }

  private static String[] attempt(String name, Runnable body) {
    try {
      body.run();
      return new String[] {name, null};
    } catch (Failure e) {
      return new String[] {name, e.getMessage()};
    } catch (RuntimeException e) {
      return new String[] {name, e.toString()};
    }
  }

  private static void check(boolean condition, String message) {
    if (!condition) {
      throw new Failure(message);
    }
  }

  // ---------------------------------------------------------------- scenarios

  private List<Scenario> scenarios() {
    Map<String, String> production = Map.of("QUALIFY_ENVIRONMENT", "production");
    Map<String, String> override = new HashMap<>(production);
    override.put("QUALIFY_ALLOW_WRITE", "OQ-CONF-007=conformance override");
    return List.of(
        new Scenario(
            "all-pass",
            List.of(Invocation.of(0, "AllPassTest")),
            0,
            0,
            "all-pass",
            null,
            null,
            null),
        new Scenario(
            "failing-check-stops",
            List.of(Invocation.of(1, "FailingCheckStopsTest")),
            1,
            1,
            "failing-check-stops",
            null,
            null,
            null),
        new Scenario(
            "soft-check",
            List.of(Invocation.of(1, "SoftCheckTest")),
            1,
            -1,
            "soft-check",
            null,
            null,
            null),
        new Scenario(
            "thrown-error",
            List.of(Invocation.of(1, "ThrownErrorTest")),
            1,
            -1,
            "thrown-error",
            "<runtime error>",
            null,
            c ->
                check(
                    "IllegalStateException"
                        .equals(error(test(c.merged(), "OQ-CONF-004")).get("type")),
                    "error.type is not IllegalStateException")),
        new Scenario(
            "plain-assertion",
            List.of(Invocation.of(1, "PlainAssertionTest")),
            1,
            -1,
            "plain-assertion",
            "<assertion error>",
            null,
            c ->
                check(
                    "AssertionError".equals(error(test(c.merged(), "OQ-CONF-005")).get("type")),
                    "error.type is not AssertionError")),
        new Scenario(
            "runtime-skip",
            List.of(Invocation.of(0, "RuntimeSkipTest")),
            0,
            0,
            "runtime-skip",
            null,
            null,
            c ->
                check(
                    c.output().contains("aborted 1"), "JUnit did not report the test as aborted")),
        new Scenario(
            "policy-skip.a",
            List.of(Invocation.of(0, "PolicySkipTest").with(production)),
            0,
            -1,
            "policy-skip.a",
            null,
            List.of("PolicySkipTest"),
            c ->
                check(
                    c.output().contains("skipped 1"), "JUnit did not report the test as skipped")),
        new Scenario(
            "policy-skip.b",
            List.of(Invocation.of(0, "PolicySkipTest").with(override)),
            0,
            -1,
            "policy-skip.b",
            null,
            List.of("PolicySkipTest"),
            null),
        new Scenario(
            "missing-scope",
            List.of(Invocation.of(1, "MissingScopeTest")),
            -1,
            -1,
            null,
            null,
            null,
            declarationError(List.of(List.of("OQ-CONF-008", "scope")))),
        new Scenario(
            "bad-id",
            List.of(Invocation.of(1, "BadIdTest")),
            -1,
            -1,
            null,
            null,
            null,
            declarationError(
                List.of(List.of("OQ-conf-009", "pattern"), List.of("IQ-CONF-010", "level")))),
        new Scenario(
            "secret-redaction",
            List.of(
                Invocation.of(1, "SecretRedactionTest")
                    .with(Map.of("QUALIFY_SECRET_CONFORMANCE_TOKEN", SECRET))),
            1,
            -1,
            "secret-redaction",
            "<runtime error>",
            null,
            this::checkSecretRedaction),
        new Scenario(
            "pattern-redaction",
            List.of(Invocation.of(0, "PatternRedactionTest")),
            0,
            -1,
            "pattern-redaction",
            null,
            null,
            c -> {
              List<String> shapes =
                  List.of(
                      "AK" + "IA" + "ABCDEFGHIJKLMNOP",
                      "eyJhbGciOiJIUzI1NiJ9" + ".eyJ",
                      "BEGIN PRIVATE" + " KEY");
              for (Path path : filesBelow(c.dir())) {
                String text = Files.readString(path, StandardCharsets.ISO_8859_1);
                for (String shape : shapes) {
                  check(!text.contains(shape), path.getFileName() + " holds a secret shape");
                }
              }
            }),
        new Scenario(
            "several-requirements",
            List.of(Invocation.of(0, "SeveralRequirementsTest")),
            0,
            -1,
            "several-requirements",
            null,
            null,
            c -> {
              check(
                  test(c.merged(), "OQ-CONF-013")
                      .get("requirements")
                      .equals(List.of("REQ-1", "REQ-2")),
                  "the record holds other requirements");
              Exec trace =
                  traceWith(
                      c.dir(),
                      List.of(
                          "--map",
                          tsFixtures.resolve("several-requirements.trace.yaml").toString()),
                      "several-requirements.trace.json");
              check(trace.status() == 0, "trace exited " + trace.status() + ", expected 0");
            }),
        new Scenario(
            "narrative",
            List.of(Invocation.of(0, "NarrativeTest")),
            0,
            -1,
            "narrative",
            null,
            null,
            c -> {
              Map<String, Object> test = test(c.merged(), "PQ-CONF-014");
              check("données d’entrée — 入力".equals(test.get("given")), "given changed");
              check("the run 🚀 starts".equals(test.get("when")), "when changed");
              check("“quoted” output".equals(test.get("then")), "then changed");
              check(List.of("first", "second", "third — 3").equals(test.get("and")), "and changed");
            }),
        new Scenario(
            "attachments",
            List.of(
                Invocation.of(0, "AttachmentsTest#withinLimit(com.lekman.qualify.QualifyContext)"),
                Invocation.of(1, "AttachmentsTest#overLimit(com.lekman.qualify.QualifyContext)")
                    .with(Map.of("QUALIFY_ATTACHMENT_LIMIT", "16"))),
            1,
            -1,
            "attachments",
            null,
            null,
            this::checkAttachments),
        new Scenario(
            "report-images",
            List.of(Invocation.of(0, "ReportImagesTest")),
            0,
            -1,
            "report-images",
            null,
            null,
            this::checkReportImages),
        new Scenario(
            "value-normalisation",
            List.of(Invocation.of(0, "ValueNormalisationTest")),
            0,
            -1,
            "value-normalisation",
            null,
            null,
            null),
        new Scenario(
            "duplicate-id",
            List.of(Invocation.of(0, "DuplicateIdATest", "DuplicateIdBTest")),
            2,
            -1,
            null,
            null,
            null,
            c -> {
              check(c.output().contains("OQ-CONF-018"), "merge did not name OQ-CONF-018");
              check(!Files.exists(c.dir().resolve("test-evidence.json")), "merge wrote a run file");
            }),
        new Scenario(
            "crash",
            List.of(Invocation.of(-1, "CrashTest")),
            1,
            1,
            "crash",
            null,
            null,
            c ->
                check(
                    "DidNotFinish".equals(error(test(c.merged(), "OQ-CONF-019")).get("type")),
                    "the crash is not DidNotFinish")),
        new Scenario(
            "deselected",
            List.of(Invocation.of(0, "DeselectedTest#selected()")),
            0,
            -1,
            "deselected",
            null,
            null,
            c -> {
              check(tests(c.merged()).size() == 1, "more than one record");
              Exec trace =
                  traceWith(
                      c.dir(),
                      List.of(
                          "--protocol", tsFixtures.resolve("deselected.protocol.yaml").toString()),
                      "deselected.trace.json");
              check(trace.status() == 3, "trace exited " + trace.status() + ", expected 3");
            }),
        new Scenario(
            "control-pair",
            List.of(Invocation.of(0, "ControlPairTest")),
            0,
            -1,
            "control-pair",
            null,
            null,
            c -> {
              check(
                  "OQ-CONF-022".equals(test(c.merged(), "OQ-CONF-023").get("controls")),
                  "OQ-CONF-023 has no controls");
              traceWith(c.dir(), List.of(), "control-pair.trace.json");
            }));
  }

  private void checkAttachments(Context c) {
    Map<String, Object> passed = test(c.merged(), "OQ-CONF-015");
    byte[] blob = new byte[256];
    for (int i = 0; i < blob.length; i++) {
      blob[i] = (byte) i;
    }
    Map<String, Object> note = attachment(passed, "note.txt");
    Map<String, Object> bin = attachment(passed, "blob.bin");
    check(
        Long.valueOf(6).equals(note.get("sizeBytes"))
            && EvidenceFiles.sha256("hello\n".getBytes(StandardCharsets.UTF_8))
                .equals(note.get("sha256")),
        "note.txt size or digest is wrong");
    check(
        Long.valueOf(256).equals(bin.get("sizeBytes"))
            && EvidenceFiles.sha256(blob).equals(bin.get("sha256")),
        "blob.bin size or digest is wrong");
    Map<String, Object> big = test(c.merged(), "OQ-CONF-016");
    check(
        "error".equals(big.get("outcome")) && "AttachmentTooLarge".equals(error(big).get("type")),
        "OQ-CONF-016 is not AttachmentTooLarge");
    check(((List<?>) big.get("attachments")).isEmpty(), "OQ-CONF-016 recorded an attachment");
  }

  private void checkSecretRedaction(Context c) throws IOException {
    byte[] secret = SECRET.getBytes(StandardCharsets.UTF_8);
    for (Path path : filesBelow(c.dir())) {
      check(
          indexOf(Files.readAllBytes(path), secret) < 0, path.getFileName() + " holds the secret");
    }
    Map<String, Object> test = test(c.merged(), "OQ-CONF-011");
    String json =
        new String(
            Base64.getDecoder().decode((String) attachment(test, "request.json").get("content")),
            StandardCharsets.UTF_8);
    check(
        Json.compact(parse(json))
            .equals("{\"note\":\"x [REDACTED]\",\"token\":\"[REDACTED]\",\"url\":\"/x\"}"),
        "request.json does not decode to the redacted document");
    byte[] raw = Base64.getDecoder().decode((String) attachment(test, "raw.bin").get("content"));
    ByteArrayOutputStream wanted = new ByteArrayOutputStream();
    wanted.write(0x00);
    wanted.write(0xFF);
    wanted.writeBytes("[REDACTED]".getBytes(StandardCharsets.UTF_8));
    wanted.write(0x00);
    check(
        Arrays.equals(raw, wanted.toByteArray()),
        "raw.bin does not decode to 0x00 0xFF [REDACTED] 0x00");
    check(
        "failed with [REDACTED]".equals(error(test).get("message")),
        "the error message is not redacted");
    check(!c.output().contains(SECRET), "the runner's own output shows the secret");
  }

  private static Check declarationError(List<List<String>> expectations) {
    return c -> {
      check(recordsOf(c.dir()).isEmpty(), "a declaration error wrote files to records/");
      for (List<String> pair : expectations) {
        check(
            c.output()
                .lines()
                .anyMatch(line -> line.contains(pair.get(0)) && line.contains(pair.get(1))),
            "the runner output does not name " + pair.get(0) + " with \"" + pair.get(1) + "\"");
      }
    };
  }

  // ----------------------------------------------------------------- running

  private void runScenario(Scenario scenario) {
    Path dir = tempDir("qualify-" + scenario.name() + "-");
    try {
      StringBuilder output = new StringBuilder();
      List<String> classes = new ArrayList<>();
      for (Invocation invocation : scenario.invocations()) {
        Exec result = runTests(invocation, dir, false);
        output.append(result.output());
        boolean ok =
            invocation.status() < 0 ? result.status() != 0 : result.status() == invocation.status();
        check(
            ok,
            "the launcher exited "
                + result.status()
                + ", expected "
                + (invocation.status() < 0 ? "non-zero" : invocation.status())
                + "\n"
                + tail(result.output()));
        invocation.selectors().forEach(s -> classes.add(s.split("#", -1)[0]));
      }
      for (String name : recordsOf(dir)) {
        Exec valid = cli(List.of("validate", dir.resolve("records").resolve(name).toString()), dir);
        check(valid.status() == 0, name + " is not valid: " + valid.output());
      }
      Map<String, Object> merged = null;
      if (scenario.merge() >= 0) {
        Exec merge = cli(List.of("merge", "--evidence-dir", dir.toString()), dir);
        output.append(merge.output());
        check(
            merge.status() == scenario.merge(),
            "merge exited "
                + merge.status()
                + ", expected "
                + scenario.merge()
                + "\n"
                + merge.output());
        Path runFile = dir.resolve("test-evidence.json");
        if (Files.exists(runFile)) {
          merged = readRun(dir);
          Exec valid = cli(List.of("validate", runFile.toString()), dir);
          check(valid.status() == 0, "the run file is not valid: " + valid.output());
          checkSites(merged, scenario.sites() != null ? scenario.sites() : classes);
        }
      }
      if (scenario.trace() >= 0) {
        Exec trace =
            tsTrace(
                List.of(
                    dir.resolve("test-evidence.json").toString(),
                    "--json",
                    dir.resolve("exit.trace.json").toString()));
        check(
            trace.status() == scenario.trace(),
            "trace exited "
                + trace.status()
                + ", expected "
                + scenario.trace()
                + "\n"
                + trace.output());
      }
      if (scenario.check() != null) {
        try {
          scenario.check().run(new Context(dir, merged, output.toString()));
        } catch (Failure e) {
          throw e;
        } catch (Exception e) {
          throw new Failure(e.toString());
        }
      }
      if (scenario.expectedFile() != null) {
        check(merged != null, "merge wrote no run file");
        compare(
            scenario.expectedFile() + ".json",
            Json.document(mask(merged, scenario.errorType()), EvidenceShape.FILE));
      }
    } finally {
      delete(dir);
    }
  }

  /** Scenario 16: scenarios 1, 2 and 13 together, twice, on two threads. */
  private void runParallel() {
    List<String> documents = new ArrayList<>();
    for (int round = 0; round < 2; round++) {
      Path dir = tempDir("qualify-parallel-");
      try {
        Exec result =
            runTests(
                Invocation.of(1, "AllPassTest", "FailingCheckStopsTest", "NarrativeTest"),
                dir,
                true);
        check(
            result.status() == 1,
            "the launcher exited " + result.status() + ", expected 1\n" + tail(result.output()));
        Matcher threads = Pattern.compile("threads: (\\d+)").matcher(result.output());
        check(
            threads.find() && Integer.parseInt(threads.group(1)) >= 2,
            "the tests did not run on at least two threads\n" + tail(result.output()));
        Exec merge = cli(List.of("merge", "--evidence-dir", dir.toString()), dir);
        check(merge.status() == 1, "merge exited " + merge.status() + ", expected 1");
        Map<String, Object> merged = readRun(dir);
        checkSites(merged, List.of("AllPassTest", "FailingCheckStopsTest", "NarrativeTest"));
        documents.add(Json.document(mask(merged, null), EvidenceShape.FILE));
      } finally {
        delete(dir);
      }
    }
    check(documents.get(0).equals(documents.get(1)), "the two parallel runs differ");
    compare("parallel-determinism.json", documents.get(0));
  }

  /**
   * Not a numbered scenario: without QUALIFY_RUN_ID, every file of one launcher session shares one
   * run ID.
   */
  private void runSharedRunId() {
    Path dir = tempDir("qualify-run-id-");
    try {
      Map<String, String> env = scenarioEnv(dir, Map.of());
      env.remove("QUALIFY_RUN_ID");
      List<String> command = new ArrayList<>(launcherCommand(false));
      command.add(PACKAGE + "AllPassTest");
      command.add(PACKAGE + "RuntimeSkipTest");
      Exec result = exec(command, env);
      check(
          result.status() == 0,
          "the launcher exited " + result.status() + "\n" + tail(result.output()));
      List<String> records = recordsOf(dir);
      check(records.size() == 4, "expected 2 markers and 2 records, found " + records.size());
      Set<String> ids = Set.copyOf(records.stream().map(n -> n.substring(0, 26)).toList());
      check(ids.size() == 1 && !ids.contains(RUN_ID), "the files used " + ids.size() + " run IDs");
    } finally {
      delete(dir);
    }
  }

  // ------------------------------------------------------------------ report

  private static final String REPORT_TIME = "2026-01-02T03:04:05.006Z";
  private static final List<String> ROLES = List.of("Prepared by", "Reviewed by", "Approved by");

  /** Scenarios 1, 2 and 6 as one run, merged once and shared by the report scenarios. */
  private Path reportRun() {
    if (reportRunDir != null) {
      return reportRunDir.resolve("test-evidence.json");
    }
    Path dir = tempDir("qualify-report-");
    Exec result =
        runTests(
            Invocation.of(1, "AllPassTest", "FailingCheckStopsTest", "RuntimeSkipTest"),
            dir,
            false);
    check(
        result.status() == 1,
        "the launcher exited " + result.status() + ", expected 1\n" + tail(result.output()));
    Exec merge = cli(List.of("merge", "--evidence-dir", dir.toString()), dir);
    check(merge.status() == 1, "merge exited " + merge.status() + ", expected 1");
    reportRunDir = dir;
    return dir.resolve("test-evidence.json");
  }

  /** Run {@code qualify report} on the shared run file; the PDF path is fresh each time. */
  private Path report(List<String> args, List<String> exec) {
    Path runFile = reportRun();
    Path pdf = runFile.resolveSibling("report-" + Long.toHexString(System.nanoTime()) + ".pdf");
    List<String> command =
        new ArrayList<>(
            List.of(
                java,
                "-jar",
                cliJar.toString(),
                "report",
                runFile.toString(),
                "--pdf",
                pdf.toString()));
    command.addAll(args);
    Map<String, String> env = scenarioEnv(runFile.getParent(), Map.of());
    env.put("QUALIFY_REPORT_TIME", REPORT_TIME);
    Exec result = exec(command, env);
    exec.add(String.valueOf(result.status()));
    exec.add(result.output());
    return pdf;
  }

  private List<String> outline(String name) {
    return read(expected.resolve(name))
        .lines()
        .map(line -> line.replaceAll("\\s+", " ").trim())
        .filter(line -> !line.isEmpty())
        .toList();
  }

  /** The checks every rendered report shares: outline, metadata, cover and page chrome. */
  private PdfText checkReport(Path pdf, String outlineFile, String title, String header) {
    PdfText text;
    try {
      text = PdfText.extract(pdf);
    } catch (IOException e) {
      throw new Failure("cannot read the PDF: " + e);
    }
    String missing = PdfText.missingFromOutline(text.lines(), outline(outlineFile));
    check(missing == null, "the report text does not hold \"" + missing + "\" in order");
    String digest;
    try {
      digest = EvidenceFiles.sha256(Files.readAllBytes(reportRun()));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
    check(title.equals(text.info().get("Title")), "Title is " + text.info().get("Title"));
    check(RUN_ID.equals(text.info().get("Subject")), "Subject is " + text.info().get("Subject"));
    check(
        text.info().get("Keywords").contains("sha256:" + digest),
        "Keywords is " + text.info().get("Keywords"));
    check(
        text.info().get("CreationDate").startsWith("D:20260102030405"),
        "CreationDate is " + text.info().get("CreationDate"));
    List<String> cover = text.pages().get(0);
    check(cover.stream().noneMatch(l -> l.matches(".*Page \\d+ of.*")), "the cover has a footer");
    long allowed = header.equals(title) ? 1 : 0;
    check(cover.stream().filter(header::equals).count() <= allowed, "the cover has a header");
    int pages = text.pages().size();
    for (int n = 2; n <= pages; n++) {
      List<String> page = text.pages().get(n - 1);
      check(
          !page.isEmpty() && page.get(0).equals(header),
          "page "
              + n
              + " starts with \""
              + (page.isEmpty() ? "" : page.get(0))
              + "\", not the header \""
              + header
              + "\"");
      String footer = "Page " + n + " of " + pages;
      check(
          page.stream().anyMatch(l -> l.contains(footer) && l.contains(digest.substring(0, 12))),
          "page " + n + " has no footer");
    }
    return text;
  }

  /**
   * Scenario 23: renders the scenario's run file with the plain theme, then checks the outline and
   * the images the pages after the cover place.
   */
  private void checkReportImages(Context c) throws IOException {
    Path pdf = c.dir().resolve("report-images.pdf");
    Map<String, String> env = scenarioEnv(c.dir(), Map.of());
    env.put("QUALIFY_REPORT_TIME", REPORT_TIME);
    Exec result =
        exec(
            List.of(
                java,
                "-jar",
                cliJar.toString(),
                "report",
                c.dir().resolve("test-evidence.json").toString(),
                "--pdf",
                pdf.toString(),
                "--theme",
                "plain",
                "--title",
                "Conformance images",
                "--document-id",
                "CONF-IMG-001"),
            env);
    check(
        result.status() == 0,
        "report exited " + result.status() + ", expected 0\n" + result.output());
    String missing =
        PdfText.missingFromOutline(
            PdfText.extract(pdf).lines(), outline("report-images.outline.txt"));
    check(missing == null, "the report text does not hold \"" + missing + "\" in order");
    List<List<String>> pages = PdfImages.extract(pdf);
    List<String> placed = new ArrayList<>();
    pages.subList(1, pages.size()).forEach(placed::addAll);
    placed.sort(Comparator.naturalOrder());
    check(
        placed.equals(List.of("200x600", "48x48", "960x540")),
        "the pages place the images " + placed);
    keep(pdf, "report-images.pdf");
  }

  /** Scenario 21: the default theme. */
  private void runReport() {
    List<String> exec = new ArrayList<>();
    Path pdf =
        report(
            List.of(
                "--protocol",
                fixtures.resolve("report.protocol.yaml").toString(),
                "--title",
                "Conformance report",
                "--document-id",
                "CONF-RPT-001"),
            exec);
    check(exec.get(0).equals("0"), "report exited " + exec.get(0) + ", expected 0\n" + exec.get(1));
    PdfText text =
        checkReport(pdf, "report.outline.txt", "Conformance report", "Conformance report Internal");
    check(
        text.pages().get(1).stream().anyMatch(l -> l.startsWith("CONF-RPT-001 Page 2 of")),
        "page 2 has no footer CONF-RPT-001 Page 2 of");
    keep(pdf, "report-lekman.pdf");
  }

  /** Scenario 22: the plain theme, an invalid theme, and flags over the theme. */
  private void runReportTheme() {
    List<String> common =
        List.of(
            "--protocol",
            fixtures.resolve("report.protocol.yaml").toString(),
            "--title",
            "Conformance report",
            "--document-id",
            "CONF-RPT-001");
    // Run A: the plain theme.
    List<String> a = new ArrayList<>();
    List<String> argsA = new ArrayList<>(common);
    argsA.addAll(List.of("--theme", "plain"));
    Path pdfA = report(argsA, a);
    check(a.get(0).equals("0"), "run A exited " + a.get(0) + ", expected 0\n" + a.get(1));
    String plain =
        String.join(
            "\n",
            checkReport(
                    pdfA, "report-plain.outline.txt", "Conformance report", "Conformance report")
                .lines());
    for (String absent : List.of("lekman.com", "Classification", "Internal")) {
      check(!plain.contains(absent), "the plain report holds \"" + absent + "\"");
    }
    keep(pdfA, "report-plain.pdf");

    // Run B: an unknown token.
    List<String> b = new ArrayList<>();
    Path pdfB =
        report(
            List.of("--theme", fixtures.resolve("bad-theme").resolve("theme.json").toString()), b);
    check(b.get(0).equals("2"), "run B exited " + b.get(0) + ", expected 2\n" + b.get(1));
    check(b.get(1).contains("{nope}"), "run B's error does not name {nope}");
    check(!Files.exists(pdfB), "run B wrote a PDF");

    // Run C: classification and signatures from flags.
    List<String> c = new ArrayList<>();
    Path pdfC =
        report(
            List.of(
                "--theme",
                "lekman",
                "--classification",
                "Commercial in confidence",
                "--no-signatures"),
            c);
    check(c.get(0).equals("0"), "run C exited " + c.get(0) + ", expected 0\n" + c.get(1));
    PdfText text;
    try {
      text = PdfText.extract(pdfC);
    } catch (IOException e) {
      throw new Failure("cannot read the PDF: " + e);
    }
    check(
        text.pages().get(0).stream().anyMatch(l -> l.contains("Commercial in confidence")),
        "the cover lacks the classification");
    check(
        text.pages().get(1).get(0).equals("Qualification report Commercial in confidence"),
        "the page 2 header lacks the classification: " + text.pages().get(1).get(0));
    for (String role : ROLES) {
      check(
          text.lines().stream().noneMatch(l -> l.contains(role)),
          "run C holds the signature role " + role);
    }
  }

  /** With {@code --sample DIR}, keep a rendered PDF for the README images. */
  private void keep(Path pdf, String name) {
    if (sample == null) {
      return;
    }
    try {
      Files.createDirectories(sample);
      Files.copy(pdf, sample.resolve(name), StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private Exec runTests(Invocation invocation, Path dir, boolean parallel) {
    List<String> command = new ArrayList<>(launcherCommand(parallel));
    invocation.selectors().forEach(s -> command.add(PACKAGE + s));
    return exec(command, scenarioEnv(dir, invocation.env()));
  }

  private List<String> launcherCommand(boolean parallel) {
    List<String> command =
        new ArrayList<>(List.of(java, "-ea", "-cp", classpath, ScenarioLauncher.class.getName()));
    if (parallel) {
      command.add("--parallel");
    }
    return command;
  }

  private Exec cli(List<String> args, Path dir) {
    List<String> command = new ArrayList<>(List.of(java, "-jar", cliJar.toString()));
    command.addAll(args);
    return exec(command, scenarioEnv(dir, Map.of()));
  }

  private Exec tsTrace(List<String> args) {
    check(
        Files.exists(tsCli),
        tsCli + " is missing: run bun install and bun run build at the repository root");
    List<String> command = new ArrayList<>(List.of("node", tsCli.toString(), "trace"));
    command.addAll(args);
    return exec(command, scenarioEnv(repo, Map.of()));
  }

  private Exec traceWith(Path dir, List<String> args, String expectedName) {
    Path json = dir.resolve("trace.json");
    List<String> all = new ArrayList<>(List.of(dir.resolve("test-evidence.json").toString()));
    all.addAll(args);
    all.addAll(List.of("--json", json.toString(), "--md", dir.resolve("trace.md").toString()));
    Exec result = tsTrace(all);
    check(Files.exists(json), "trace wrote no trace.json: " + result.output());
    Map<String, Object> trace = asMap(parse(read(json)));
    List<String> problems = Schemas.trace(Json.toNode(trace));
    check(problems.isEmpty(), "trace.json is not valid: " + String.join("; ", problems));
    compare(expectedName, Json.document(maskTrace(trace), TRACE));
    return result;
  }

  private Map<String, String> scenarioEnv(Path dir, Map<String, String> extra) {
    Map<String, String> env = new HashMap<>();
    System.getenv()
        .forEach(
            (k, v) -> {
              if (!k.startsWith("QUALIFY_")) {
                env.put(k, v);
              }
            });
    env.put("QUALIFY_RUN_ID", RUN_ID);
    env.put("QUALIFY_EVIDENCE_DIR", dir.toString());
    env.putAll(extra);
    return env;
  }

  private static Exec exec(List<String> command, Map<String, String> env) {
    ProcessBuilder builder = new ProcessBuilder(command).redirectErrorStream(true);
    builder.environment().clear();
    builder.environment().putAll(env);
    builder.directory(Path.of("").toAbsolutePath().toFile());
    try {
      Process process = builder.start();
      process.getOutputStream().close();
      String output;
      try (InputStream in = process.getInputStream()) {
        output = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      }
      if (!process.waitFor(5, TimeUnit.MINUTES)) {
        process.destroyForcibly();
        throw new Failure("timed out: " + String.join(" ", command));
      }
      return new Exec(process.exitValue(), output);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new Failure("interrupted");
    }
  }

  // ----------------------------------------------------------------- masking

  /** The masking table of spec/qualify/conformance/README.md. */
  @SuppressWarnings("unchecked")
  private static Map<String, Object> mask(Map<String, Object> file, String errorType) {
    Map<String, Object> copy = asMap(parse(Json.compact(file)));
    Map<String, Object> run = (Map<String, Object>) copy.get("run");
    run.put("startedAt", "<timestamp>");
    run.put("endedAt", "<timestamp>");
    Map<String, Object> tool = new LinkedHashMap<>();
    tool.put("name", "<tool>");
    tool.put("version", "<version>");
    tool.put("language", "<language>");
    tool.put("runtime", "<runtime>");
    run.put("tool", tool);
    Map<String, Object> source = new LinkedHashMap<>();
    source.put("commit", null);
    source.put("branch", null);
    source.put("dirty", null);
    run.put("source", source);
    Map<String, Object> actor = new LinkedHashMap<>();
    actor.put("name", null);
    actor.put("ci", null);
    actor.put("ciRunUrl", null);
    run.put("actor", actor);
    run.remove("selection");
    List<Object> tests = new ArrayList<>();
    for (Object item : (List<Object>) copy.get("tests")) {
      Map<String, Object> test = (Map<String, Object>) item;
      test.put("startedAt", "<timestamp>");
      test.put("endedAt", "<timestamp>");
      test.put("durationMs", 0L);
      test.put("site", maskSite((String) test.get("site")));
      for (Object c : (List<Object>) test.get("checks")) {
        Map<String, Object> check = (Map<String, Object>) c;
        check.put("site", maskSite((String) check.get("site")));
        check.remove("at");
        if (check.containsKey("delegate")) {
          check.put("delegate", "<function>");
        }
      }
      Map<String, Object> error = (Map<String, Object>) test.get("error");
      if (error != null) {
        if (error.get("site") != null) {
          error.put("site", maskSite((String) error.get("site")));
        }
        if (errorType != null) {
          error.put("type", errorType);
        }
      }
      tests.add(maskStrings(test));
    }
    copy.put("tests", tests);
    return copy;
  }

  private static String maskSite(String site) {
    return site.replaceAll("^.*:\\d+$", "<scenario>:0");
  }

  @SuppressWarnings("unchecked")
  private static Object maskStrings(Object value) {
    if (value instanceof String s) {
      return UNSERIALISABLE.matcher(s).replaceAll("[unserialisable: <type>]");
    }
    if (value instanceof List<?> list) {
      List<Object> out = new ArrayList<>();
      list.forEach(item -> out.add(maskStrings(item)));
      return out;
    }
    if (value instanceof Map<?, ?> map) {
      Map<String, Object> out = new LinkedHashMap<>();
      ((Map<String, Object>) map).forEach((k, v) -> out.put(k, maskStrings(v)));
      return out;
    }
    return value;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> maskTrace(Map<String, Object> trace) {
    for (Object item : (List<Object>) trace.get("inputs")) {
      Map<String, Object> input = (Map<String, Object>) item;
      input.put("path", Path.of((String) input.get("path")).getFileName().toString());
      input.put("sha256", "<sha256>");
    }
    for (Object item : (List<Object>) trace.get("runs")) {
      ((Map<String, Object>) item).put("commit", null);
    }
    return trace;
  }

  /** Every site must point into one of the scenario's own test classes. */
  @SuppressWarnings("unchecked")
  private static void checkSites(Map<String, Object> file, List<String> allowed) {
    List<String> sites = new ArrayList<>();
    for (Map<String, Object> test : tests(file)) {
      sites.add((String) test.get("site"));
      for (Object c : (List<Object>) test.get("checks")) {
        sites.add((String) ((Map<String, Object>) c).get("site"));
      }
      Map<String, Object> error = (Map<String, Object>) test.get("error");
      if (error != null && error.get("site") != null) {
        sites.add((String) error.get("site"));
      }
    }
    for (String site : sites) {
      Matcher match = SITE_FILE.matcher(site);
      check(
          match.matches()
              && allowed.contains(match.group(1))
              && site.contains("src/conformance/java/"),
          "site " + site + " does not point into " + String.join(" or ", allowed));
    }
  }

  // ----------------------------------------------------------------- helpers

  private void compare(String name, String document) {
    Path path = expected.resolve(name);
    check(Files.exists(path), "expected file " + name + " is missing");
    String wanted = read(path);
    if (wanted.equals(document)) {
      return;
    }
    String[] a = wanted.split("\n", -1);
    String[] b = document.split("\n", -1);
    int line = 0;
    while (line < Math.min(a.length, b.length) && a[line].equals(b[line])) {
      line++;
    }
    throw new Failure(
        name
            + " differs at line "
            + (line + 1)
            + ":\n  expected: "
            + (line < a.length ? a[line] : "<end>")
            + "\n  actual:   "
            + (line < b.length ? b[line] : "<end>"));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> error(Map<String, Object> test) {
    Object error = test.get("error");
    check(error != null, test.get("id") + " has no error");
    return (Map<String, Object>) error;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> attachment(Map<String, Object> test, String filename) {
    for (Object item : (List<Object>) test.get("attachments")) {
      Map<String, Object> attachment = (Map<String, Object>) item;
      if (filename.equals(attachment.get("filename"))) {
        return attachment;
      }
    }
    throw new Failure(test.get("id") + " has no attachment " + filename);
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap(Object value) {
    return (Map<String, Object>) Objects.requireNonNull(value);
  }

  private static List<Path> filesBelow(Path dir) {
    try (Stream<Path> files = Files.walk(dir)) {
      return files.filter(Files::isRegularFile).toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static void delete(Path dir) {
    try (Stream<Path> files = Files.walk(dir)) {
      for (Path path : files.sorted(Comparator.reverseOrder()).toList()) {
        Files.deleteIfExists(path);
      }
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static int indexOf(byte[] haystack, byte[] needle) {
    outer:
    for (int i = 0; i + needle.length <= haystack.length; i++) {
      for (int j = 0; j < needle.length; j++) {
        if (haystack[i + j] != needle[j]) {
          continue outer;
        }
      }
      return i;
    }
    return -1;
  }

  private static Object parse(String text) {
    try {
      return Json.parse(text);
    } catch (JsonFormatException e) {
      throw new Failure("not valid JSON: " + e.getMessage());
    }
  }

  private static String read(Path path) {
    try {
      return Files.readString(path, StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static Map<String, Object> readRun(Path dir) {
    return asMap(parse(read(dir.resolve("test-evidence.json"))));
  }

  private static List<String> recordsOf(Path dir) {
    Path records = dir.resolve("records");
    if (!Files.isDirectory(records)) {
      return List.of();
    }
    try (Stream<Path> files = Files.list(records)) {
      return files
          .map(p -> p.getFileName().toString())
          .filter(n -> !n.startsWith("."))
          .sorted()
          .toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static String tail(String output) {
    return output.length() <= 3000 ? output : output.substring(output.length() - 3000);
  }

  private static Path tempDir(String prefix) {
    try {
      return Files.createTempDirectory(prefix);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> test(Map<String, Object> file, String id) {
    for (Map<String, Object> test : tests(file)) {
      if (id.equals(test.get("id"))) {
        return test;
      }
    }
    throw new Failure("no record for " + id);
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> tests(Map<String, Object> file) {
    check(file != null, "merge wrote no run file");
    List<Map<String, Object>> tests = new ArrayList<>();
    for (Object item : (List<Object>) file.get("tests")) {
      tests.add((Map<String, Object>) item);
    }
    return tests;
  }
}
