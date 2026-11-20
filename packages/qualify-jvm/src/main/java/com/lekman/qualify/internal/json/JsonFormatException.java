package com.lekman.qualify.internal.json;

/** Text that is not valid JSON. */
public final class JsonFormatException extends Exception {

  private static final long serialVersionUID = 1L;

  /** A parse failure with the parser's own message. */
  public JsonFormatException(String message, Throwable cause) {
    super(message, cause);
  }
}
