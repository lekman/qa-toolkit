package com.lekman.qualify;

/**
 * {@link QualifyContext#secret(String)} found no value for the name. The outcome is {@code error}.
 */
public class SecretNotFound extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** A missing secret. */
  public SecretNotFound(String message) {
    super(message);
  }
}
