package com.lekman.qualify.internal.json;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * Writes numbers the way JavaScript's {@code JSON.stringify} does, so every language writes the
 * same bytes: integers without a decimal point, other numbers with the shortest digits that read
 * back as the same double, and an exponent only below 1e-6 or from 1e21.
 */
public final class JsonNumbers {

  private JsonNumbers() {}

  /** The text of a double. A non-finite double is written as {@code null}. */
  public static String format(double value) {
    if (Double.isNaN(value) || Double.isInfinite(value)) {
      return "null";
    }
    if (value == 0) {
      return "0";
    }
    double abs = Math.abs(value);
    BigDecimal exact = new BigDecimal(abs);
    BigDecimal shortest = exact;
    for (int precision = 1; precision <= 17; precision++) {
      BigDecimal candidate = exact.round(new MathContext(precision, RoundingMode.HALF_EVEN));
      if (candidate.doubleValue() == abs) {
        shortest = candidate;
        break;
      }
    }
    shortest = shortest.stripTrailingZeros();
    String digits = shortest.unscaledValue().toString();
    int k = digits.length();
    int n = k - shortest.scale();
    String text;
    if (k <= n && n <= 21) {
      text = digits + "0".repeat(n - k);
    } else if (0 < n && n <= 21) {
      text = digits.substring(0, n) + "." + digits.substring(n);
    } else if (-6 < n && n <= 0) {
      text = "0." + "0".repeat(-n) + digits;
    } else {
      int exponent = n - 1;
      String mantissa = k == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
      text = mantissa + "e" + (exponent >= 0 ? "+" : "-") + Math.abs(exponent);
    }
    return value < 0 ? "-" + text : text;
  }
}
