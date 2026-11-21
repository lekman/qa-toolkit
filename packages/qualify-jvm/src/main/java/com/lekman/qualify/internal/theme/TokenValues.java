package com.lekman.qualify.internal.theme;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The values tokens stand for, section 9.3 of the specification.
 *
 * @param title the resolved title
 * @param classification the resolved classification
 * @param documentId the document ID
 * @param environment the run's environment
 * @param levels the levels present, as {@code IQ and OQ}
 * @param date the generation date
 * @param version the target version, or {@code -}
 * @param verdict {@code Passed}, {@code Failed} or {@code Incomplete}
 * @param runId the run ID
 * @param sha12 the first 12 characters of the run file's SHA-256
 */
public record TokenValues(
    String title,
    String classification,
    String documentId,
    String environment,
    String levels,
    String date,
    String version,
    String verdict,
    String runId,
    String sha12) {

  /** The same values with another title and classification. */
  public TokenValues with(String newTitle, String newClassification) {
    return new TokenValues(
        newTitle,
        newClassification,
        documentId,
        environment,
        levels,
        date,
        version,
        verdict,
        runId,
        sha12);
  }

  /** The values by token name. */
  public Map<String, String> asMap() {
    Map<String, String> map = new LinkedHashMap<>();
    map.put("title", title);
    map.put("classification", classification);
    map.put("documentId", documentId);
    map.put("environment", environment);
    map.put("levels", levels);
    map.put("date", date);
    map.put("version", version);
    map.put("verdict", verdict);
    map.put("runId", runId);
    map.put("sha12", sha12);
    return map;
  }
}
