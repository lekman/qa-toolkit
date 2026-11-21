package com.lekman.qualify;

import java.util.List;

/**
 * A qualification test declared wrongly, such as a bad ID or a missing scope. The test fails before
 * it starts and writes no evidence.
 */
public class DeclarationError extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final transient List<String> problems;

  /**
   * A declaration error listing every problem at once.
   *
   * @param id the declared ID, as written
   * @param problems what is wrong, one entry each
   */
  public DeclarationError(String id, List<String> problems) {
    super("qualify: " + id + " is not a valid qualification test: " + String.join("; ", problems));
    this.problems = List.copyOf(problems);
  }

  /** What is wrong with the declaration. */
  public List<String> getProblems() {
    return problems;
  }
}
