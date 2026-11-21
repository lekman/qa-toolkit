package com.lekman.qualify;

/** A qualify setting that cannot be used. Every qualification test of the run fails with it. */
public class ConfigurationError extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** A setting error. */
  public ConfigurationError(String message) {
    super(message);
  }
}
