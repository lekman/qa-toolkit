package com.lekman.qualify;

import java.io.Serializable;

/**
 * Work for {@link QualifyContext#delegate(String, String, ThrowingRunnable)}. Serializable so
 * qualify can read the name of the method a lambda or method reference calls.
 */
@FunctionalInterface
public interface ThrowingRunnable extends Serializable {
  /** Run the work. */
  void run() throws Throwable;
}
