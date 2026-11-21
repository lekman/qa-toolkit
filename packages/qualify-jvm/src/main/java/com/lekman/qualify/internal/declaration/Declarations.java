package com.lekman.qualify.internal.declaration;

import com.lekman.qualify.DeclarationError;
import com.lekman.qualify.Level;
import com.lekman.qualify.Risk;
import com.lekman.qualify.Scope;
import com.lekman.qualify.internal.json.Json;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/** Validation of declarations, sections 2.1 and 4 of the specification. */
public final class Declarations {

  /** The pattern every test ID matches. */
  public static final Pattern ID_PATTERN =
      Pattern.compile("^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$");

  private Declarations() {}

  /** Whether a string is a valid test ID for any level. */
  public static boolean isTestId(String value) {
    return value != null && ID_PATTERN.matcher(value).matches();
  }

  /**
   * Validate a declaration. Every problem is collected into one {@link DeclarationError}, so a test
   * author sees them all at once.
   */
  public static Declaration validate(DeclaredFields fields, String site) {
    List<String> problems = new ArrayList<>();
    Level level = fields.level();
    String id = fields.id();
    if (!isTestId(id)) {
      problems.add(
          "ID does not match the pattern " + ID_PATTERN.pattern() + ", for example OQ-EXPORT-003");
    } else if (!id.startsWith(level.name() + "-")) {
      problems.add(
          "ID prefix " + id.substring(0, 2) + " does not match the declared level " + level.name());
    }
    if (blank(fields.title())) {
      problems.add("title must not be empty");
    } else if (fields.title().contains("\n") || fields.title().contains("\r")) {
      problems.add("title must be one line");
    }
    if (blank(fields.given())) {
      problems.add("given must not be empty");
    }
    if (blank(fields.when())) {
      problems.add("when must not be empty");
    }
    if (blank(fields.then())) {
      problems.add("then must not be empty");
    }
    if (fields.and().stream().anyMatch(Declarations::blank)) {
      problems.add("and must be a list of clauses, each not empty");
    }
    String scope = scope(level, fields.scope(), problems);
    List<String> requirements = requirements(fields.requirements(), problems);
    List<String> tags = tags(fields.tags(), problems);
    String controls = fields.controls().isEmpty() ? null : fields.controls();
    if (controls != null && !isTestId(controls)) {
      problems.add("controls must be the ID of another qualification test");
    } else if (controls != null && controls.equals(id)) {
      problems.add("a test cannot be the control for itself");
    }
    if (!problems.isEmpty()) {
      throw new DeclarationError(String.valueOf(id), problems);
    }
    Risk risk = fields.risk();
    return new Declaration(
        id,
        level,
        fields.title(),
        fields.given(),
        fields.when(),
        fields.then(),
        fields.and().isEmpty() ? null : List.copyOf(fields.and()),
        java.util.Objects.requireNonNull(scope, "a valid declaration has a scope"),
        requirements,
        risk == null ? null : risk.json(),
        tags,
        controls,
        site);
  }

  private static boolean blank(String value) {
    return value == null || value.isBlank();
  }

  private static List<String> requirements(List<String> values, List<String> problems) {
    if (values.stream().anyMatch(r -> r.isEmpty() || r.length() > 64)) {
      problems.add("each requirement ID must be 1 to 64 characters");
    }
    Set<String> seen = new LinkedHashSet<>();
    Set<String> duplicates = new LinkedHashSet<>();
    for (String r : values) {
      if (!seen.add(r)) {
        duplicates.add(r);
      }
    }
    if (!duplicates.isEmpty()) {
      problems.add("requirements are duplicated: " + String.join(", ", duplicates));
    }
    return List.copyOf(values);
  }

  private static @Nullable String scope(
      Level level, @Nullable Scope declared, List<String> problems) {
    if (level == Level.IQ || level == Level.IU) {
      if (declared != null && declared != Scope.UNDECLARED) {
        problems.add(
            "scope must not be declared for "
                + level
                + " tests, which are always "
                + (level == Level.IQ ? "read" : "read-write"));
      }
      return level == Level.IQ ? "read" : "read-write";
    }
    if (declared == null || declared == Scope.UNDECLARED) {
      problems.add("scope is required for " + level + " tests (read or read-write)");
      return null;
    }
    return declared.json();
  }

  private static List<String> tags(List<String> values, List<String> problems) {
    if (values.stream().anyMatch(String::isEmpty)) {
      problems.add("tags must be a list of strings, each not empty");
    }
    TreeSet<String> sorted = new TreeSet<>(Json.CODE_POINT_ORDER);
    sorted.addAll(values);
    return List.copyOf(sorted);
  }
}
