package com.lekman.qualify.cli;

/** An input that cannot be used. Exit 2. */
final class InputError extends RuntimeException {
  private static final long serialVersionUID = 1L;

  InputError(String message) {
    super(message);
  }
}
