package com.lekman.qualify.internal.report;

import com.lekman.qualify.internal.json.Json;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.function.IntPredicate;
import org.jspecify.annotations.Nullable;

/** How values are written in the report, section 9.2 of the specification. */
public final class ReportText {

  /** Shown for a value that is missing. */
  public static final String MISSING = "-";

  private static final int CUT = 200;
  private static final DateTimeFormatter TIME =
      DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss 'UTC'").withZone(ZoneOffset.UTC);

  private ReportText() {}

  /**
   * Replace every character the font cannot draw with {@code ?}. Tabs become spaces; line breaks
   * stay, for the layout to split on.
   */
  public static String drawable(String text, IntPredicate canDraw) {
    String normalised = text.replace("\r\n", "\n").replace('\r', '\n').replace('\t', ' ');
    StringBuilder out = new StringBuilder();
    normalised
        .codePoints()
        .forEach(
            code -> {
              if (code == '\n') {
                out.append('\n');
              } else if (code < 0x20 || (code >= 0x7F && code < 0xA0) || !canDraw.test(code)) {
                out.append('?');
              } else {
                out.appendCodePoint(code);
              }
            });
    return out.toString();
  }

  /** A value as compact JSON, cut after 200 code points. */
  public static String json(@Nullable Object value) {
    String text = Json.compact(value);
    int length = text.codePointCount(0, text.length());
    if (length <= CUT) {
      return text;
    }
    int end = text.offsetByCodePoints(0, CUT);
    return text.substring(0, end) + "… (" + (length - CUT) + " more characters)";
  }

  /** A list joined with commas, or {@code -} when it is empty. */
  public static String list(List<String> values) {
    return values.isEmpty() ? MISSING : String.join(", ", values);
  }

  /** A value, or {@code -} when it is missing or empty. */
  public static String orMissing(@Nullable String value) {
    return value == null || value.isEmpty() ? MISSING : value;
  }

  /** A timestamp as {@code YYYY-MM-DD HH:MM:SS UTC}. */
  public static String time(Instant instant) {
    return TIME.format(instant);
  }

  /** A timestamp string of the evidence as {@code YYYY-MM-DD HH:MM:SS UTC}. */
  public static String time(String timestamp) {
    return time(Instant.parse(timestamp));
  }

  /** The verdict in words. */
  public static String verdict(String verdict) {
    return switch (verdict) {
      case "pass" -> "Passed";
      case "fail" -> "Failed";
      default -> "Incomplete";
    };
  }
}
