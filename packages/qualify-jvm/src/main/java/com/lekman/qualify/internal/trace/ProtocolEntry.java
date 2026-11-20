package com.lekman.qualify.internal.trace;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * One test a protocol requires.
 *
 * @param id the test ID
 * @param level the level
 * @param title the title
 * @param requirements requirement IDs
 * @param risk the risk, or {@code null}
 */
public record ProtocolEntry(
    String id, String level, String title, List<String> requirements, @Nullable String risk) {}
