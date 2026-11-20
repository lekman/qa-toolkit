package com.lekman.qualify;

import java.util.Collection;
import java.util.regex.Pattern;

/**
 * The matchers of section 3.2 of the specification, with Java names. Each records one check and
 * returns whether it passed. A failed hard check throws {@link CheckFailed}. The evidence records
 * the shared matcher name given with each method.
 */
public interface Assertion {

  /** {@code equals}: deep equality after normalisation. */
  boolean isEqualTo(Object expected);

  /** {@code notEquals}: not deep-equal after normalisation. */
  boolean isNotEqualTo(Object expected);

  /**
   * {@code contains}: a string contains the substring, or a collection or array holds an equal
   * element.
   */
  boolean contains(Object expected);

  /**
   * {@code matches}: a string matches the regular expression somewhere ({@link
   * java.util.regex.Matcher#find()}).
   */
  boolean matches(String regex);

  /**
   * {@code matches}: a string matches the pattern somewhere ({@link
   * java.util.regex.Matcher#find()}).
   */
  boolean matches(Pattern pattern);

  /** {@code isTrue}: the value is {@code Boolean.TRUE}. */
  boolean isTrue();

  /** {@code isFalse}: the value is {@code Boolean.FALSE}. */
  boolean isFalse();

  /** {@code isNull}: the value is {@code null}. */
  boolean isNull();

  /** {@code isNotNull}: the value is not {@code null}. */
  boolean isNotNull();

  /** {@code hasLength}: a string (in code points), collection, map or array has the length. */
  boolean hasLength(int length);

  /** {@code atLeast}: a number is at least the bound. */
  boolean isAtLeast(Number bound);

  /** {@code atMost}: a number is at most the bound. */
  boolean isAtMost(Number bound);

  /** {@code oneOf}: the value equals one of the values. */
  boolean isOneOf(Object... values);

  /** {@code oneOf}: the value equals one of the values. */
  boolean isOneOf(Collection<?> values);
}
