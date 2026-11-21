package com.lekman.qualify.cli;

/** A problem with how the command was called. Exit 64. */
final class UsageError extends RuntimeException {
  private static final long serialVersionUID = 1L;

  UsageError(String message) {
    super(message);
  }
}
