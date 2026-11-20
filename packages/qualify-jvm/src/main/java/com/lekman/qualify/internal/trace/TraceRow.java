package com.lekman.qualify.internal.trace;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * One row of the trace matrix: a link between a requirement and a test result.
 *
 * @param requirement the requirement, or {@code null} for a test with no link
 * @param sources where the link came from: {@code code}, {@code protocol}, {@code map}
 * @param testId the test ID
 * @param level the level
 * @param title the title
 * @param risk the risk, or {@code null}
 * @param controls the controlled test, or {@code null}
 * @param outcome the outcome, or {@code not-run}
 * @param run the run ID, or {@code null} when not run
 */
public record TraceRow(
    @Nullable String requirement,
    List<String> sources,
    String testId,
    String level,
    String title,
    @Nullable String risk,
    @Nullable String controls,
    String outcome,
    @Nullable String run) {}
