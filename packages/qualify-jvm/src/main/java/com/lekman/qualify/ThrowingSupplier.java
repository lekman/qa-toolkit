package com.lekman.qualify;

import java.io.Serializable;

/**
 * Work that returns a value, for {@link QualifyContext#delegateValue(String, String,
 * ThrowingSupplier)}. Serializable so qualify can read the name of the method a lambda or method
 * reference calls.
 *
 * @param <T> the result type
 */
@FunctionalInterface
public interface ThrowingSupplier<T> extends Serializable {
  /** Run the work and return its result. */
  T get() throws Throwable;
}
