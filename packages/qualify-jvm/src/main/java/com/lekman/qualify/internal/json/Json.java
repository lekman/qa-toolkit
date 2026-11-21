package com.lekman.qualify.internal.json;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * JSON as the evidence files hold it. A value is {@code null}, a {@link Boolean}, a {@link String},
 * a {@link Long} for an integer, a {@link Double} for any other number, a {@link List} or a {@link
 * Map} with string keys. {@link #document} writes it the way every evidence file is written: UTF-8,
 * two-space indent, keys in the order a {@link Shape} gives and sorted by code point everywhere
 * else, and a trailing newline.
 */
public final class Json {

  /** Orders strings by Unicode code point, the order every language can reproduce. */
  public static final Comparator<String> CODE_POINT_ORDER = Json::compare;

  private static final JsonMapper MAPPER =
      JsonMapper.builder()
          .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
          .enable(DeserializationFeature.USE_BIG_INTEGER_FOR_INTS)
          .build();

  private Json() {}

  /** Compare two strings by Unicode code point. */
  public static int compare(String a, String b) {
    int i = 0;
    int j = 0;
    while (i < a.length() && j < b.length()) {
      int x = a.codePointAt(i);
      int y = b.codePointAt(j);
      if (x != y) {
        return x < y ? -1 : 1;
      }
      i += Character.charCount(x);
      j += Character.charCount(y);
    }
    // One string is a prefix of the other: the shorter sorts first.
    return Integer.compare(a.length() - i, b.length() - j);
  }

  /**
   * A compact text form with sorted keys and no spaces. Two values are equal when their texts are.
   */
  public static String compact(@Nullable Object value) {
    StringBuilder out = new StringBuilder();
    compact(value, out);
    return out.toString();
  }

  /** A document: the value written with the shape, and a newline. */
  public static String document(@Nullable Object value, Shape shape) {
    StringBuilder out = new StringBuilder();
    write(value, shape, 0, out);
    return out.append('\n').toString();
  }

  /** A document of a plain value, keys sorted at every depth. */
  public static String document(@Nullable Object value) {
    return document(value, Shape.VALUE);
  }

  /** Parse JSON text into the value model. */
  public static @Nullable Object parse(String text) throws JsonFormatException {
    return fromNode(parseNode(text));
  }

  /** Parse JSON text into a Jackson tree, for the schema validator. */
  public static JsonNode parseNode(String text) throws JsonFormatException {
    try {
      return MAPPER.readTree(text);
    } catch (JacksonException e) {
      throw new JsonFormatException(e.getOriginalMessage(), e);
    }
  }

  /** Convert a value of the model into a Jackson tree. */
  public static JsonNode toNode(@Nullable Object value) {
    try {
      return MAPPER.readTree(compact(value));
    } catch (JacksonException e) {
      throw new IllegalStateException("the value model wrote JSON that does not parse", e);
    }
  }

  /** Convert a Jackson tree into the value model. */
  public static @Nullable Object fromNode(@Nullable JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return null;
    }
    if (node.isBoolean()) {
      return node.booleanValue();
    }
    if (node.isString()) {
      return node.stringValue();
    }
    if (node.isIntegralNumber()) {
      BigInteger big = node.bigIntegerValue();
      return big.bitLength() < 64 ? (Object) big.longValue() : big;
    }
    if (node.isNumber()) {
      double d = node.doubleValue();
      if (d == Math.rint(d) && Math.abs(d) < 9.007199254740992E15) {
        return (long) d;
      }
      return d;
    }
    if (node.isArray()) {
      List<@Nullable Object> list = new ArrayList<>(node.size());
      for (JsonNode item : node) {
        list.add(fromNode(item));
      }
      return list;
    }
    Map<String, @Nullable Object> map = new LinkedHashMap<>();
    for (Map.Entry<String, JsonNode> entry : node.properties()) {
      map.put(entry.getKey(), fromNode(entry.getValue()));
    }
    return map;
  }

  /** A string as {@code JSON.stringify} writes it. */
  public static String quote(String text) {
    StringBuilder out = new StringBuilder(text.length() + 2);
    quote(text, out);
    return out.toString();
  }

  private static void compact(@Nullable Object value, StringBuilder out) {
    if (value instanceof List<?> list) {
      out.append('[');
      for (int i = 0; i < list.size(); i++) {
        if (i > 0) {
          out.append(',');
        }
        compact(list.get(i), out);
      }
      out.append(']');
    } else if (value instanceof Map<?, ?> map) {
      out.append('{');
      boolean first = true;
      for (String key : sortedKeys(map)) {
        if (!first) {
          out.append(',');
        }
        first = false;
        quote(key, out);
        out.append(':');
        compact(map.get(key), out);
      }
      out.append('}');
    } else {
      scalar(value, out);
    }
  }

  private static List<String> keyOrder(Map<?, ?> map, Shape shape) {
    if (!(shape instanceof Shape.Obj obj)) {
      return sortedKeys(map);
    }
    List<String> keys = new ArrayList<>();
    for (String key : obj.order()) {
      if (map.containsKey(key)) {
        keys.add(key);
      }
    }
    for (String key : sortedKeys(map)) {
      if (!obj.order().contains(key)) {
        keys.add(key);
      }
    }
    return keys;
  }

  private static void quote(String text, StringBuilder out) {
    out.append('"');
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\b' -> out.append("\\b");
        case '\f' -> out.append("\\f");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          boolean loneHigh =
              Character.isHighSurrogate(c)
                  && (i + 1 >= text.length() || !Character.isLowSurrogate(text.charAt(i + 1)));
          boolean loneLow =
              Character.isLowSurrogate(c)
                  && (i == 0 || !Character.isHighSurrogate(text.charAt(i - 1)));
          if (c < 0x20 || loneHigh || loneLow) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    out.append('"');
  }

  private static void scalar(@Nullable Object value, StringBuilder out) {
    if (value == null) {
      out.append("null");
    } else if (value instanceof String s) {
      quote(s, out);
    } else if (value instanceof Boolean b) {
      out.append(b);
    } else if (value instanceof Long || value instanceof Integer || value instanceof BigInteger) {
      out.append(value);
    } else if (value instanceof Number n) {
      out.append(JsonNumbers.format(n.doubleValue()));
    } else {
      throw new IllegalArgumentException("not a JSON value: " + value.getClass().getName());
    }
  }

  private static List<String> sortedKeys(Map<?, ?> map) {
    List<String> keys = new ArrayList<>();
    for (Object key : map.keySet()) {
      keys.add((String) key);
    }
    keys.sort(CODE_POINT_ORDER);
    return keys;
  }

  private static void write(@Nullable Object value, Shape shape, int depth, StringBuilder out) {
    if (value instanceof List<?> list) {
      if (list.isEmpty()) {
        out.append("[]");
        return;
      }
      Shape items = shape instanceof Shape.Items i ? i.items() : Shape.VALUE;
      out.append("[\n");
      for (int i = 0; i < list.size(); i++) {
        out.append("  ".repeat(depth + 1));
        write(list.get(i), items, depth + 1, out);
        out.append(i + 1 < list.size() ? ",\n" : "\n");
      }
      out.append("  ".repeat(depth)).append(']');
    } else if (value instanceof Map<?, ?> map) {
      List<String> keys = keyOrder(map, shape);
      if (keys.isEmpty()) {
        out.append("{}");
        return;
      }
      out.append("{\n");
      for (int i = 0; i < keys.size(); i++) {
        String key = keys.get(i);
        out.append("  ".repeat(depth + 1));
        quote(key, out);
        out.append(": ");
        Shape child = shape instanceof Shape.Obj obj ? obj.field(key) : Shape.VALUE;
        write(map.get(key), child, depth + 1, out);
        out.append(i + 1 < keys.size() ? ",\n" : "\n");
      }
      out.append("  ".repeat(depth)).append('}');
    } else {
      scalar(value, out);
    }
  }
}
