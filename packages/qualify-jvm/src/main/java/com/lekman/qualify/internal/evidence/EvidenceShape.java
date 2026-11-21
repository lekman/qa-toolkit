package com.lekman.qualify.internal.evidence;

import com.lekman.qualify.internal.json.Shape;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Key order of every evidence file: the order properties appear in {@code evidence.schema.json}.
 * Values inside {@code expected}, {@code actual} and {@code target} have no shape, so their keys
 * are sorted.
 */
public final class EvidenceShape {

  private static final List<String> DECLARATION =
      List.of(
          "id",
          "level",
          "title",
          "given",
          "when",
          "then",
          "and",
          "scope",
          "requirements",
          "risk",
          "tags",
          "controls",
          "site");

  /** The shape of the {@code run} envelope. */
  public static final Shape RUN =
      Shape.object(
          List.of(
              "id",
              "environment",
              "tool",
              "source",
              "actor",
              "target",
              "policy",
              "selection",
              "startedAt",
              "endedAt",
              "mergedRuns"),
          Map.of(
              "tool", Shape.object("name", "version", "language", "runtime"),
              "source", Shape.object("commit", "branch", "dirty"),
              "actor", Shape.object("name", "ci", "ciRunUrl"),
              "policy",
                  Shape.object(
                      List.of("productionWriteBlocked", "overrides"),
                      Map.of("overrides", Shape.items(Shape.object("id", "reason")))),
              "selection", Shape.object("levels", "ids", "tags", "excludeTags")));

  /** The shape of one check. */
  public static final Shape CHECK =
      Shape.object(
          "seq",
          "context",
          "description",
          "matcher",
          "expected",
          "actual",
          "pass",
          "soft",
          "site",
          "delegate",
          "at");

  /** The shape of a test: a marker's, a record's or one of a run file's tests. */
  public static final Shape TEST = test();

  /** The shape of every evidence file. */
  public static final Shape FILE =
      Shape.object(
          List.of("schemaVersion", "kind", "run", "summary", "tests", "test"),
          Map.of(
              "run",
              RUN,
              "summary",
              Shape.object("total", "pass", "fail", "error", "skip", "verdict"),
              "tests",
              Shape.items(TEST),
              "test",
              TEST));

  private EvidenceShape() {}

  private static Shape test() {
    List<String> order = new ArrayList<>(DECLARATION);
    order.addAll(
        List.of(
            "outcome",
            "skipReason",
            "error",
            "startedAt",
            "endedAt",
            "durationMs",
            "checks",
            "attachments",
            "secretsUsed"));
    return Shape.object(
        order,
        Map.of(
            "error", Shape.object("type", "message", "site"),
            "checks", Shape.items(CHECK),
            "attachments",
                Shape.items(
                    Shape.object(
                        "filename", "contentType", "encoding", "content", "sizeBytes", "sha256"))));
  }
}
