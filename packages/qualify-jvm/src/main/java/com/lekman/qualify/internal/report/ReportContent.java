package com.lekman.qualify.internal.report;

import com.lekman.qualify.internal.report.Block.Column;
import com.lekman.qualify.internal.report.Block.Field;
import com.lekman.qualify.internal.theme.Template;
import com.lekman.qualify.internal.theme.Theme;
import com.lekman.qualify.internal.theme.TokenValues;
import com.lekman.qualify.internal.trace.Trace;
import com.lekman.qualify.internal.trace.TraceRow;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.jspecify.annotations.Nullable;

/**
 * The content of the qualification report, section 9.1 of the specification: the cover, the run
 * details, the summary and traceability, one section per test, and the signature block. Pure: the
 * theme decides the texts, the layout comes later.
 */
public final class ReportContent {

  private static final List<String> LEVELS = List.of("IQ", "OQ", "PQ", "IU");
  private static final List<String> OUTCOMES = List.of("pass", "fail", "error", "skip");

  private ReportContent() {}

  /**
   * What the caller asked for. A {@code null} value comes from the theme.
   *
   * @param generatedAt the generation time
   * @param title the title flag
   * @param subtitle the subtitle flag
   * @param documentId the document ID flag
   * @param classification the classification flag
   * @param signatures roles from {@code --signatures}, an empty list for {@code --no-signatures},
   *     or {@code null} for the theme's
   */
  public record Options(
      Instant generatedAt,
      @Nullable String title,
      @Nullable String subtitle,
      @Nullable String documentId,
      @Nullable String classification,
      @Nullable List<String> signatures) {}

  /**
   * Build the document.
   *
   * @param runFile the run file
   * @param digest the SHA-256 of the run file exactly as read
   * @param trace the trace of this run
   * @param theme the theme
   * @param producer the name and version of the package writing the PDF
   * @param options the flags
   */
  public static ReportDocument build(
      Map<String, Object> runFile,
      String digest,
      Trace trace,
      Theme theme,
      String producer,
      Options options) {
    Map<String, Object> run = object(runFile.get("run"));
    List<Map<String, Object>> tests = objects(runFile.get("tests"));
    TokenValues tokens = tokens(runFile, digest, theme, options);
    String subtitle =
        options.subtitle() != null
            ? options.subtitle()
            : Template.render(theme.text("subtitle"), tokens.asMap());
    List<String> roles = options.signatures() != null ? options.signatures() : theme.signatures();

    List<ReportImages.Source> images = new ArrayList<>();
    List<Block> blocks = new ArrayList<>();
    blocks.add(new Block.Heading(1, tokens.title()));
    blocks.addAll(details(run, digest, options.generatedAt()));
    blocks.addAll(summary(tests, trace));
    for (Map<String, Object> test : tests) {
      blocks.addAll(test(test, images));
    }
    if (!roles.isEmpty()) {
      blocks.add(new Block.Heading(2, "Signatures"));
      blocks.add(new Block.Signatures(List.copyOf(roles)));
    }
    return new ReportDocument(
        new ReportDocument.Cover(
            theme.brandName(),
            tokens.title(),
            subtitle,
            coverFields(theme.coverFields(), tokens, runFile)),
        blocks,
        theme.text("header"),
        theme.text("footer"),
        tokens.classification(),
        tokens,
        new ReportDocument.Metadata(
            tokens.title(),
            String.valueOf(run.get("id")),
            "sha256:" + digest,
            producer,
            options.generatedAt()),
        List.copyOf(images));
  }

  /** {@code <total> tests: <pass> pass, <fail> fail, <error> error, <skip> skip} */
  public static String counts(Map<String, Object> summary) {
    return summary.get("total")
        + " tests: "
        + summary.get("pass")
        + " pass, "
        + summary.get("fail")
        + " fail, "
        + summary.get("error")
        + " error, "
        + summary.get("skip")
        + " skip";
  }

  /** {@code QR-<environment>-<run start date as YYYYMMDD>} */
  public static String documentId(Map<String, Object> run) {
    String started = String.valueOf(run.get("startedAt"));
    return "QR-" + run.get("environment") + "-" + started.substring(0, 10).replace("-", "");
  }

  /**
   * The levels present, in IQ, OQ, PQ, IU order: {@code IQ}, {@code IQ and OQ}, {@code IQ, OQ and
   * PQ}.
   */
  public static String levels(List<Map<String, Object>> tests) {
    List<String> present =
        LEVELS.stream()
            .filter(l -> tests.stream().anyMatch(t -> l.equals(t.get("level"))))
            .toList();
    if (present.isEmpty()) {
      return ReportText.MISSING;
    }
    if (present.size() == 1) {
      return present.get(0);
    }
    return String.join(", ", present.subList(0, present.size() - 1))
        + " and "
        + present.get(present.size() - 1);
  }

  /**
   * Token values for the theme's texts. The classification and the title are resolved first, from
   * flags or from their templates, so the other texts can use them.
   */
  public static TokenValues tokens(
      Map<String, Object> runFile, String digest, Theme theme, Options options) {
    Map<String, Object> run = object(runFile.get("run"));
    Map<String, Object> target = object(run.get("target"));
    Map<String, Object> summary = object(runFile.get("summary"));
    TokenValues base =
        new TokenValues(
            "",
            "",
            options.documentId() != null ? options.documentId() : documentId(run),
            String.valueOf(run.get("environment")),
            levels(objects(runFile.get("tests"))),
            options.generatedAt().toString().substring(0, 10),
            ReportText.orMissing((String) target.get("version")),
            ReportText.verdict(String.valueOf(summary.get("verdict"))),
            String.valueOf(run.get("id")),
            digest.substring(0, 12));
    String classification =
        options.classification() != null
            ? options.classification()
            : Template.render(theme.text("classification"), base.asMap());
    String title =
        options.title() != null
            ? options.title()
            : Template.render(theme.text("title"), base.asMap());
    return base.with(title, classification);
  }

  private static List<Field> coverFields(
      List<String> fields, TokenValues tokens, Map<String, Object> runFile) {
    Map<String, Object> source = object(object(runFile.get("run")).get("source"));
    String commit = (String) source.get("commit");
    Map<String, Field> rows = new HashMap<>();
    rows.put("documentId", new Field("Document ID", tokens.documentId()));
    rows.put("date", new Field("Date", tokens.date()));
    rows.put("verdict", new Field("Verdict", tokens.verdict()));
    rows.put("tests", new Field("Tests", counts(object(runFile.get("summary")))));
    rows.put("environment", new Field("Environment", tokens.environment()));
    rows.put("version", new Field("Version", tokens.version()));
    rows.put(
        "commit",
        new Field("Commit", ReportText.orMissing(commit == null ? null : commit.substring(0, 12))));
    rows.put("classification", new Field("Classification", tokens.classification()));
    List<Field> result = new ArrayList<>();
    for (String field : fields) {
      if (field.equals("classification") && tokens.classification().isEmpty()) {
        continue;
      }
      result.add(Objects.requireNonNull(rows.get(field)));
    }
    return result;
  }

  private static List<Block> details(Map<String, Object> run, String digest, Instant generatedAt) {
    Map<String, Object> source = object(run.get("source"));
    Map<String, Object> tool = object(run.get("tool"));
    List<String> overrides = new ArrayList<>();
    for (Map<String, Object> o : objects(object(run.get("policy")).get("overrides"))) {
      overrides.add(o.get("id") + ": " + o.get("reason"));
    }
    return List.of(
        new Block.Heading(2, "Run details"),
        new Block.Fields(
            List.of(
                new Field("Run ID", String.valueOf(run.get("id")), true),
                new Field("Run start", ReportText.time(String.valueOf(run.get("startedAt")))),
                new Field("Run end", ReportText.time(String.valueOf(run.get("endedAt")))),
                new Field("Commit", ReportText.orMissing((String) source.get("commit")), true),
                new Field("Branch", ReportText.orMissing((String) source.get("branch"))),
                new Field("Tool", tool.get("name") + " " + tool.get("version")),
                new Field("Generated", ReportText.time(generatedAt)),
                new Field("Run file SHA-256", digest, true),
                new Field("Merged runs", ReportText.list(strings(run.get("mergedRuns"))), true),
                new Field("Write overrides", ReportText.list(overrides)))));
  }

  private static Block list(List<String> items) {
    return items.isEmpty() ? new Block.Paragraph("None") : new Block.Bullets(List.copyOf(items));
  }

  private static List<String> row(String label, List<Map<String, Object>> tests) {
    List<String> row = new ArrayList<>();
    row.add(label);
    row.add(String.valueOf(tests.size()));
    for (String outcome : OUTCOMES) {
      row.add(String.valueOf(tests.stream().filter(t -> outcome.equals(t.get("outcome"))).count()));
    }
    return row;
  }

  private static List<Block> summary(List<Map<String, Object>> tests, Trace trace) {
    List<List<String>> counts = new ArrayList<>();
    for (String level : LEVELS) {
      counts.add(row(level, tests.stream().filter(t -> level.equals(t.get("level"))).toList()));
    }
    counts.add(row("All", tests));
    Map<String, String> titles = new HashMap<>();
    List<List<String>> rows = new ArrayList<>();
    for (TraceRow r : trace.rows()) {
      titles.putIfAbsent(r.testId(), r.title());
      rows.add(
          List.of(
              r.requirement() == null
                  ? ReportText.MISSING
                  : r.requirement() + " (" + String.join(", ", r.sources()) + ")",
              r.testId(),
              r.level(),
              r.title(),
              ReportText.orMissing(r.risk()),
              r.outcome()));
    }
    List<String> notRun = new ArrayList<>();
    for (String id : trace.notRun()) {
      notRun.add((id + " " + titles.getOrDefault(id, "")).trim());
    }
    return List.of(
        new Block.Heading(2, "Summary"),
        new Block.Table(
            List.of(
                new Column("Level", 0.2),
                new Column("Total", 0.16),
                new Column("Pass", 0.16),
                new Column("Fail", 0.16),
                new Column("Error", 0.16),
                new Column("Skip", 0.16)),
            counts),
        new Block.Heading(2, "Traceability"),
        new Block.Table(
            List.of(
                new Column("Requirement", 0.2),
                new Column("Test ID", 0.19, true),
                new Column("Level", 0.08),
                new Column("Title", 0.3),
                new Column("Risk", 0.09),
                new Column("Outcome", 0.14)),
            rows),
        new Block.Heading(3, "Not run"),
        list(notRun),
        new Block.Heading(3, "Requirements without a passing test"),
        list(trace.requirementsWithoutPass()));
  }

  /**
   * The PNG and JPEG attachments of a test as image blocks, in the order attached. Their bytes are
   * added to {@code images}, which the blocks index.
   */
  private static List<Block> images(
      List<Map<String, Object>> attachments, List<ReportImages.Source> images) {
    List<Block> blocks = new ArrayList<>();
    for (Map<String, Object> attachment : attachments) {
      ReportImages.Format format =
          ReportImages.format(String.valueOf(attachment.get("contentType")));
      if (format == null) {
        continue;
      }
      images.add(
          new ReportImages.Source(
              Base64.getDecoder().decode(String.valueOf(attachment.get("content"))), format));
      blocks.add(
          new Block.Image(
              images.size() - 1,
              ReportImages.caption(attachment),
              ReportImages.unreadable(attachment)));
    }
    return blocks;
  }

  private static List<Block> test(Map<String, Object> test, List<ReportImages.Source> images) {
    String controls = (String) test.get("controls");
    List<Field> fields = new ArrayList<>();
    fields.add(new Field("Level", String.valueOf(test.get("level"))));
    fields.add(new Field("Outcome", String.valueOf(test.get("outcome"))));
    fields.add(new Field("Risk", ReportText.orMissing((String) test.get("risk"))));
    fields.add(new Field("Scope", String.valueOf(test.get("scope"))));
    fields.add(new Field("Requirements", ReportText.list(strings(test.get("requirements")))));
    fields.add(new Field("Tags", ReportText.list(strings(test.get("tags")))));
    fields.add(new Field("Controls", ReportText.orMissing(controls), controls != null));
    if (test.get("skipReason") != null) {
      fields.add(new Field("Skip reason", String.valueOf(test.get("skipReason"))));
    }
    if (test.get("error") != null) {
      Map<String, Object> error = object(test.get("error"));
      fields.add(new Field("Error type", String.valueOf(error.get("type"))));
      fields.add(new Field("Error message", String.valueOf(error.get("message"))));
    }
    fields.add(new Field("Given", String.valueOf(test.get("given"))));
    fields.add(new Field("When", String.valueOf(test.get("when"))));
    fields.add(new Field("Then", String.valueOf(test.get("then"))));
    for (String clause : strings(test.get("and"))) {
      fields.add(new Field("And", clause));
    }
    fields.add(new Field("Started", ReportText.time(String.valueOf(test.get("startedAt")))));
    fields.add(new Field("Duration", test.get("durationMs") + " ms"));
    fields.add(new Field("Secrets used", ReportText.list(strings(test.get("secretsUsed")))));

    List<Map<String, Object>> checks = objects(test.get("checks"));
    List<List<String>> checkRows = new ArrayList<>();
    for (Map<String, Object> c : checks) {
      checkRows.add(
          List.of(
              String.valueOf(((Number) Objects.requireNonNull(c.get("seq"))).longValue() + 1),
              String.valueOf(c.get("context")),
              String.valueOf(c.get("description")),
              String.valueOf(c.get("matcher")),
              ReportText.json(c.get("expected")),
              ReportText.json(c.get("actual")),
              (Boolean.TRUE.equals(c.get("pass")) ? "Pass" : "Fail")
                  + (Boolean.TRUE.equals(c.get("soft")) ? " (soft)" : "")));
    }
    List<Map<String, Object>> attachments = objects(test.get("attachments"));
    List<List<String>> attachmentRows = new ArrayList<>();
    for (Map<String, Object> a : attachments) {
      attachmentRows.add(
          List.of(
              String.valueOf(a.get("filename")),
              String.valueOf(a.get("contentType")),
              a.get("sizeBytes") + " bytes",
              String.valueOf(a.get("sha256"))));
    }
    List<Block> blocks = new ArrayList<>();
    Collections.addAll(
        blocks,
        new Block.Heading(2, test.get("id") + " " + test.get("title")),
        new Block.Fields(fields),
        new Block.Heading(3, "Checks"),
        checkRows.isEmpty()
            ? new Block.Paragraph("None")
            : new Block.Table(
                List.of(
                    new Column("#", 0.05),
                    new Column("Context", 0.13),
                    new Column("Description", 0.21),
                    new Column("Matcher", 0.11),
                    new Column("Expected", 0.18, true),
                    new Column("Actual", 0.18, true),
                    new Column("Result", 0.14)),
                checkRows),
        new Block.Heading(3, "Attachments"),
        attachmentRows.isEmpty()
            ? new Block.Paragraph("None")
            : new Block.Table(
                List.of(
                    new Column("File", 0.2),
                    new Column("Content type", 0.2),
                    new Column("Size", 0.12),
                    new Column("SHA-256", 0.48, true)),
                attachmentRows));
    blocks.addAll(images(attachments, images));
    return blocks;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> object(@Nullable Object value) {
    return value == null ? Map.of() : (Map<String, Object>) value;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> objects(@Nullable Object value) {
    if (value == null) {
      return List.of();
    }
    List<Map<String, Object>> list = new ArrayList<>();
    for (Object item : (List<Object>) value) {
      list.add((Map<String, Object>) item);
    }
    return list;
  }

  @SuppressWarnings("unchecked")
  private static List<String> strings(@Nullable Object value) {
    return value == null ? List.of() : (List<String>) value;
  }
}
