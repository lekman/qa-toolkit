package com.lekman.qualify.internal.declaration;

import com.lekman.qualify.Level;
import com.lekman.qualify.Risk;
import com.lekman.qualify.Scope;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The fields of a declaration as the annotation gives them, before validation. {@code scope} is
 * {@code null} for IQ and IU, whose annotations have no scope attribute.
 *
 * @param level the level, from the annotation
 * @param id the ID as written
 * @param title the title
 * @param given the state before the test
 * @param when the action
 * @param then the expected result
 * @param and further clauses
 * @param scope the declared scope, or {@code null} when the annotation has none
 * @param requirements requirement IDs
 * @param risk the declared risk
 * @param tags tags from the annotation and from JUnit {@code @Tag}
 * @param controls the controlled test's ID, or an empty string
 */
public record DeclaredFields(
    Level level,
    String id,
    String title,
    String given,
    String when,
    String then,
    List<String> and,
    @Nullable Scope scope,
    List<String> requirements,
    Risk risk,
    List<String> tags,
    String controls) {}
