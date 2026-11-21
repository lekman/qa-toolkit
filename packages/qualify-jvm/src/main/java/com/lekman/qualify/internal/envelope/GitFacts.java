package com.lekman.qualify.internal.envelope;

import org.jspecify.annotations.Nullable;

/**
 * What git says about the working tree. Every value is {@code null} when git is missing or the
 * directory is not a repository.
 *
 * @param root the repository root
 * @param commit the HEAD commit
 * @param branch the branch, or {@code null} on a detached head
 * @param dirty whether tracked files have changes
 */
public record GitFacts(
    @Nullable String root,
    @Nullable String commit,
    @Nullable String branch,
    @Nullable Boolean dirty) {
  /** No repository. */
  public static final GitFacts NONE = new GitFacts(null, null, null, null);
}
