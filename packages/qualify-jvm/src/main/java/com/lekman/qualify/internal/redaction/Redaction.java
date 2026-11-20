package com.lekman.qualify.internal.redaction;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Redaction as section 7.2 of the specification defines it. Pure functions: the caller holds the
 * registered values and passes them in.
 */
public final class Redaction {

  /** Values shorter than this are refused, because they would redact ordinary words. */
  public static final int MIN_LENGTH = 6;

  /** The text every redacted value is replaced with. */
  public static final String REPLACEMENT = "[REDACTED]";

  private static final List<Pattern> PATTERNS =
      List.of(
          // A PEM private key block, to the matching END line or, when the
          // block is cut short, to the end of the text.
          Pattern.compile(
              "-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----(?:[\\s\\S]*?-----END \\1PRIVATE KEY-----|[\\s\\S]*\\z)"),
          // A JWT shape: three base64url segments, the first starting with eyJ.
          Pattern.compile("eyJ[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"),
          // An access-key-ID shape.
          Pattern.compile("(?:AKIA|ASIA)[A-Z0-9]{16}"));

  private static final Set<String> SENSITIVE_KEYS =
      Set.of(
          "api_key",
          "apikey",
          "authorization",
          "passwd",
          "password",
          "privatekey",
          "secret",
          "token");

  private Redaction() {}

  /**
   * Redact bytes without decoding them as text. Registered values are matched as their UTF-8 bytes
   * and the pattern rules as ASCII, so the bytes around a match never change. Returns the same
   * array when nothing matched.
   */
  public static byte[] bytes(byte[] bytes, Collection<String> registered) {
    String view = new String(bytes, StandardCharsets.ISO_8859_1);
    String before = view;
    for (String value : longestFirst(registered)) {
      String needle =
          new String(value.getBytes(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1);
      view = view.replace(needle, REPLACEMENT);
    }
    view = patterns(view);
    if (view.equals(before)) {
      return bytes;
    }
    return view.getBytes(StandardCharsets.ISO_8859_1);
  }

  /**
   * Redact a JSON document of the value model: values under sensitive keys, compared without case,
   * become {@code [REDACTED]} whole; every other string and key is redacted as text.
   */
  public static @Nullable Object json(@Nullable Object value, Collection<String> registered) {
    if (value instanceof List<?> list) {
      List<@Nullable Object> result = new ArrayList<>(list.size());
      for (Object item : list) {
        result.add(json(item, registered));
      }
      return result;
    }
    if (value instanceof Map<?, ?> map) {
      Map<String, @Nullable Object> result = new LinkedHashMap<>();
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        String key = (String) entry.getKey();
        result.put(
            text(key, registered),
            SENSITIVE_KEYS.contains(key.toLowerCase(Locale.ROOT))
                ? REPLACEMENT
                : json(entry.getValue(), registered));
      }
      return result;
    }
    return value(value, registered);
  }

  /** Redact every string and key inside a JSON object. */
  @SuppressWarnings("unchecked")
  public static Map<String, Object> object(Map<String, ?> value, Collection<String> registered) {
    return (Map<String, Object>) java.util.Objects.requireNonNull(value(value, registered));
  }

  /** Apply the pattern rules only. */
  public static String patterns(String text) {
    String result = text;
    for (Pattern pattern : PATTERNS) {
      result = pattern.matcher(result).replaceAll(Matcher.quoteReplacement(REPLACEMENT));
    }
    return result;
  }

  /** Redact one string: registered values first, longest first, then the pattern rules. */
  public static String text(String text, Collection<String> registered) {
    String result = text;
    for (String value : longestFirst(registered)) {
      result = result.replace(value, REPLACEMENT);
    }
    return patterns(result);
  }

  /** Redact every string and key inside a value of the JSON model. */
  public static @Nullable Object value(@Nullable Object value, Collection<String> registered) {
    if (value instanceof String s) {
      return text(s, registered);
    }
    if (value instanceof List<?> list) {
      List<@Nullable Object> result = new ArrayList<>(list.size());
      for (Object item : list) {
        result.add(value(item, registered));
      }
      return result;
    }
    if (value instanceof Map<?, ?> map) {
      Map<String, @Nullable Object> result = new LinkedHashMap<>();
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        result.put(text((String) entry.getKey(), registered), value(entry.getValue(), registered));
      }
      return result;
    }
    return value;
  }

  private static List<String> longestFirst(Collection<String> registered) {
    List<String> values = new ArrayList<>(new LinkedHashSet<>(registered));
    values.sort(Comparator.comparingInt(String::length).reversed());
    return values;
  }
}
