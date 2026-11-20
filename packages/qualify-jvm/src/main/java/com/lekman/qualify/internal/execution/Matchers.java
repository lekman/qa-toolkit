package com.lekman.qualify.internal.execution;

import com.lekman.qualify.internal.values.Values;
import java.lang.reflect.Array;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * The matchers of section 3.2 of the specification, as pure functions from the value under test and
 * the matcher's argument to what the check records.
 */
public final class Matchers {

  private Matchers() {}

  /**
   * What one matcher records.
   *
   * @param expected the normalised expected value
   * @param actual the normalised actual value
   * @param pass whether the check passed
   */
  public record Result(@Nullable Object expected, @Nullable Object actual, boolean pass) {}

  /** {@code atLeast} and {@code atMost}. */
  public static Result bound(String matcher, @Nullable Object actual, @Nullable Number bound) {
    if (bound == null || !isComparable(bound)) {
      throw new IllegalArgumentException(matcher + "() takes a number");
    }
    boolean pass = false;
    if (actual instanceof Number n && isComparable(n)) {
      int order = compare(n, bound);
      pass = matcher.equals("atLeast") ? order >= 0 : order <= 0;
    }
    return new Result(Values.normalise(bound), Values.normalise(actual), pass);
  }

  /** {@code contains}: a substring, or an element of a collection or array. */
  public static Result contains(@Nullable Object actual, @Nullable Object expected) {
    boolean pass;
    if (actual instanceof CharSequence text && expected instanceof CharSequence part) {
      pass = text.toString().contains(part);
    } else {
      pass = elements(actual).stream().anyMatch(item -> Values.equal(item, expected));
    }
    return new Result(Values.normalise(expected), Values.normalise(actual), pass);
  }

  /** {@code equals} and {@code notEquals}. */
  public static Result equality(
      String matcher, @Nullable Object actual, @Nullable Object expected) {
    boolean equal = Values.equal(actual, expected);
    return new Result(
        Values.normalise(expected), Values.normalise(actual), matcher.equals("equals") == equal);
  }

  /** {@code hasLength}: the recorded actual value is the measured length. */
  public static Result hasLength(@Nullable Object actual, int length) {
    if (length < 0) {
      throw new IllegalArgumentException("hasLength() takes a non-negative integer");
    }
    Long measured = Values.lengthOf(actual);
    return new Result((long) length, measured, measured != null && measured == length);
  }

  /** {@code isTrue}, {@code isFalse}, {@code isNull} and {@code isNotNull}. */
  public static Result state(String matcher, @Nullable Object actual) {
    Object normalised = Values.normalise(actual);
    return switch (matcher) {
      case "isTrue" -> new Result(true, normalised, Boolean.TRUE.equals(actual));
      case "isFalse" -> new Result(false, normalised, Boolean.FALSE.equals(actual));
      case "isNull" -> new Result(null, normalised, actual == null);
      case "isNotNull" -> new Result("not null", normalised, actual != null);
      default -> throw new IllegalArgumentException("unknown matcher " + matcher);
    };
  }

  /** {@code matches}: the pattern is found somewhere in a string. */
  public static Result matches(@Nullable Object actual, @Nullable Pattern pattern) {
    if (pattern == null) {
      throw new IllegalArgumentException("matches() takes a regular expression");
    }
    boolean pass = actual instanceof CharSequence text && pattern.matcher(text).find();
    return new Result(pattern.pattern(), Values.normalise(actual), pass);
  }

  /** {@code oneOf}: the value equals one of the values. */
  public static Result oneOf(@Nullable Object actual, @Nullable Collection<?> values) {
    if (values == null) {
      throw new IllegalArgumentException("oneOf() takes a list of values");
    }
    List<@Nullable Object> list = new ArrayList<>(values);
    boolean pass = list.stream().anyMatch(item -> Values.equal(actual, item));
    return new Result(Values.normalise(list), Values.normalise(actual), pass);
  }

  private static int compare(Number a, Number b) {
    double x = a.doubleValue();
    double y = b.doubleValue();
    if (Double.isInfinite(x) || Double.isInfinite(y)) {
      return Double.compare(x, y);
    }
    return decimal(a).compareTo(decimal(b));
  }

  private static BigDecimal decimal(Number n) {
    if (n instanceof BigDecimal d) {
      return d;
    }
    if (n instanceof BigInteger i) {
      return new BigDecimal(i);
    }
    if (n instanceof Double || n instanceof Float) {
      return new BigDecimal(n.doubleValue());
    }
    return BigDecimal.valueOf(n.longValue());
  }

  private static List<@Nullable Object> elements(@Nullable Object value) {
    List<@Nullable Object> items = new ArrayList<>();
    if (value instanceof Collection<?> collection) {
      items.addAll(collection);
    } else if (value != null && value.getClass().isArray()) {
      int length = Array.getLength(value);
      for (int i = 0; i < length; i++) {
        items.add(Array.get(value, i));
      }
    }
    return items;
  }

  private static boolean isComparable(Number n) {
    return !(n instanceof Double d && d.isNaN()) && !(n instanceof Float f && f.isNaN());
  }
}
