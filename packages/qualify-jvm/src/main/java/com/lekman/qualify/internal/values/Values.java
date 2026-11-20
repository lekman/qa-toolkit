package com.lekman.qualify.internal.values;

import com.lekman.qualify.internal.json.Json;
import java.io.File;
import java.lang.reflect.Array;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URI;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Calendar;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Normalisation and comparison of the values recorded as {@code expected} and {@code actual},
 * section 7.1 of the specification, for Java and Kotlin values.
 *
 * <p>Maps, collections, arrays, records and JavaBean-style objects (public {@code getX()} and
 * {@code isX()} methods, as Kotlin data classes have) become JSON objects and arrays. Types from
 * the JDK and the Kotlin standard library that are not listed here, and objects with no readable
 * property, become {@code "[unserialisable: <type>]"}.
 */
public final class Values {

  /** The largest integer recorded as a number; beyond it integers become strings. */
  public static final long LIMIT = 1L << 53;

  private static final int MAX_DEPTH = 100;
  private static final String UNSERIALISABLE = "[unserialisable: ";
  private static final DateTimeFormatter TIMESTAMP =
      DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);
  private static final List<String> OPAQUE_PACKAGES =
      List.of("java.", "javax.", "jdk.", "sun.", "com.sun.", "kotlin.", "kotlinx.");

  private Values() {}

  /**
   * Deep equality after normalisation: {@code NaN} equals itself here. When either value holds a
   * part that cannot be serialised, the normalised forms cannot tell objects apart, so Java's own
   * {@link Objects#deepEquals} decides.
   */
  public static boolean equal(@Nullable Object a, @Nullable Object b) {
    String left = Json.compact(normalise(a));
    String right = Json.compact(normalise(b));
    if (!left.equals(right)) {
      return false;
    }
    return !left.contains(UNSERIALISABLE) || Objects.deepEquals(a, b);
  }

  /** A timestamp in the schema's format: UTC with milliseconds and a Z suffix. */
  public static String timestamp(Instant instant) {
    return TIMESTAMP.format(instant);
  }

  /**
   * The number of elements, characters or entries in a value, or {@code null} when it has no
   * length. A string's length counts Unicode code points.
   */
  public static @Nullable Long lengthOf(@Nullable Object value) {
    if (value instanceof CharSequence text) {
      return (long) text.toString().codePointCount(0, text.length());
    }
    if (value instanceof Collection<?> collection) {
      return (long) collection.size();
    }
    if (value instanceof Map<?, ?> map) {
      return (long) map.size();
    }
    if (value != null && value.getClass().isArray()) {
      return (long) Array.getLength(value);
    }
    return null;
  }

  /**
   * Normalise a value for the evidence. A value holding a cycle, or nested deeper than 100 levels,
   * becomes one {@code "[unserialisable: <type>]"} string named after the outer value's type.
   */
  public static @Nullable Object normalise(@Nullable Object value) {
    try {
      return walk(value, Collections.newSetFromMap(new IdentityHashMap<>()), 0);
    } catch (CycleFound e) {
      return unserialisable(value);
    }
  }

  /** Sort normalised values: numbers numerically, strings by code point, others by compact text. */
  public static List<@Nullable Object> sort(List<@Nullable Object> values) {
    List<@Nullable Object> sorted = new ArrayList<>(values);
    boolean numbers = sorted.stream().allMatch(v -> v instanceof Long || v instanceof Double);
    boolean strings = sorted.stream().allMatch(v -> v instanceof String);
    Comparator<@Nullable Object> order;
    if (numbers) {
      order = Comparator.comparingDouble(v -> ((Number) v).doubleValue());
    } else if (strings) {
      order = (x, y) -> Json.compare((String) x, (String) y);
    } else {
      order = (x, y) -> Json.compare(Json.compact(x), Json.compact(y));
    }
    sorted.sort(order);
    return sorted;
  }

  /** The type name recorded for a value: its simple class name. */
  public static String typeName(@Nullable Object value) {
    if (value == null) {
      return "null";
    }
    String simple = value.getClass().getSimpleName();
    return simple.isEmpty() ? value.getClass().getName() : simple;
  }

  /** {@code "[unserialisable: <type>]"} for a value. */
  public static String unserialisable(@Nullable Object value) {
    return UNSERIALISABLE + typeName(value) + "]";
  }

  private static Object bean(Object value, Set<Object> seen, int depth) {
    Map<String, Method> getters = new TreeMap<>(Json.CODE_POINT_ORDER);
    for (Method method : value.getClass().getMethods()) {
      String name = propertyName(method);
      if (name != null) {
        getters.put(name, method);
      }
    }
    if (getters.isEmpty()) {
      return unserialisable(value);
    }
    Map<String, @Nullable Object> result = new LinkedHashMap<>();
    for (Map.Entry<String, Method> entry : getters.entrySet()) {
      Object property = invoke(entry.getValue(), value);
      if (property == Unreadable.INSTANCE) {
        return unserialisable(value);
      }
      result.put(entry.getKey(), walk(property, seen, depth + 1));
    }
    return result;
  }

  private static Object bytes(byte[] bytes) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("$bytes", Base64.getEncoder().encodeToString(bytes));
    return result;
  }

  private static Object container(Object value, Set<Object> seen, int depth) {
    if (!seen.add(value)) {
      throw new CycleFound();
    }
    try {
      if (value instanceof Map<?, ?> map) {
        Map<String, @Nullable Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
          Object key = walk(entry.getKey(), seen, depth + 1);
          String name = key instanceof String s ? s : Json.compact(key);
          result.put(name, walk(entry.getValue(), seen, depth + 1));
        }
        return result;
      }
      if (value instanceof Set<?> set) {
        List<@Nullable Object> items = new ArrayList<>();
        for (Object item : set) {
          items.add(walk(item, seen, depth + 1));
        }
        return sort(items);
      }
      if (value instanceof Collection<?> collection) {
        List<@Nullable Object> items = new ArrayList<>();
        for (Object item : collection) {
          items.add(walk(item, seen, depth + 1));
        }
        return items;
      }
      if (value.getClass().isArray()) {
        int length = Array.getLength(value);
        List<@Nullable Object> items = new ArrayList<>(length);
        for (int i = 0; i < length; i++) {
          items.add(walk(Array.get(value, i), seen, depth + 1));
        }
        return items;
      }
      if (value instanceof Record record) {
        return record(record, seen, depth);
      }
      return bean(value, seen, depth);
    } finally {
      seen.remove(value);
    }
  }

  private static Object decimal(BigDecimal value) {
    BigDecimal stripped = value.stripTrailingZeros();
    if (stripped.scale() <= 0) {
      return integer(stripped.toBigIntegerExact());
    }
    return number(value.doubleValue());
  }

  private static Object instant(Instant instant) {
    if (instant.isBefore(Instant.parse("0000-01-01T00:00:00Z"))
        || !instant.isBefore(Instant.parse("+10000-01-01T00:00:00Z"))) {
      return unserialisable(instant);
    }
    return timestamp(instant);
  }

  private static Object integer(BigInteger value) {
    if (value.abs().compareTo(BigInteger.valueOf(LIMIT)) <= 0) {
      return value.longValue();
    }
    return value.toString();
  }

  private static @Nullable Object invoke(Method method, Object target) {
    try {
      if (!method.trySetAccessible() && !method.canAccess(target)) {
        return Unreadable.INSTANCE;
      }
      return method.invoke(target);
    } catch (IllegalAccessException | InvocationTargetException | RuntimeException e) {
      return Unreadable.INSTANCE;
    }
  }

  private static boolean isOpaque(Class<?> type) {
    String name = type.getName();
    return OPAQUE_PACKAGES.stream().anyMatch(name::startsWith);
  }

  private static Object number(double value) {
    if (Double.isNaN(value)) {
      return "NaN";
    }
    if (Double.isInfinite(value)) {
      return value > 0 ? "Infinity" : "-Infinity";
    }
    if (value == Math.rint(value)) {
      if (Math.abs(value) > LIMIT) {
        return new BigDecimal(value).toBigInteger().toString();
      }
      return (long) value;
    }
    return value;
  }

  private static @Nullable String propertyName(Method method) {
    if (Modifier.isStatic(method.getModifiers())
        || method.getParameterCount() != 0
        || method.getDeclaringClass() == Object.class
        || method.isSynthetic()
        || method.isBridge()) {
      return null;
    }
    String name = method.getName();
    String rest;
    if (name.startsWith("get") && name.length() > 3 && method.getReturnType() != void.class) {
      rest = name.substring(3);
    } else if (name.startsWith("is")
        && name.length() > 2
        && (method.getReturnType() == boolean.class || method.getReturnType() == Boolean.class)) {
      rest = name.substring(2);
    } else {
      return null;
    }
    if (!Character.isUpperCase(rest.charAt(0))) {
      return null;
    }
    // JavaBeans decapitalisation: URL stays URL, Amount becomes amount.
    if (rest.length() > 1 && Character.isUpperCase(rest.charAt(1))) {
      return rest;
    }
    return Character.toLowerCase(rest.charAt(0)) + rest.substring(1);
  }

  private static Object record(Record record, Set<Object> seen, int depth) {
    Map<String, @Nullable Object> result = new LinkedHashMap<>();
    for (RecordComponent component : record.getClass().getRecordComponents()) {
      Object property = invoke(component.getAccessor(), record);
      if (property == Unreadable.INSTANCE) {
        return unserialisable(record);
      }
      result.put(component.getName(), walk(property, seen, depth + 1));
    }
    return result;
  }

  @SuppressWarnings("JavaUtilDate") // java.util.Date is a value a test may check.
  private static @Nullable Object walk(@Nullable Object value, Set<Object> seen, int depth) {
    if (depth > MAX_DEPTH) {
      throw new CycleFound();
    }
    if (value == null || value instanceof Boolean || value instanceof String) {
      return value;
    }
    if (value instanceof CharSequence || value instanceof Character) {
      return value.toString();
    }
    if (value instanceof Byte
        || value instanceof Short
        || value instanceof Integer
        || value instanceof Long
        || value instanceof AtomicInteger
        || value instanceof AtomicLong) {
      return integer(BigInteger.valueOf(((Number) value).longValue()));
    }
    if (value instanceof BigInteger big) {
      return integer(big);
    }
    if (value instanceof BigDecimal decimal) {
      return decimal(decimal);
    }
    if (value instanceof Float f) {
      // A float records the decimal it was written as: 0.1f is 0.1, not 0.10000000149.
      return number(
          f.isNaN() || f.isInfinite() ? f.doubleValue() : Double.parseDouble(f.toString()));
    }
    if (value instanceof Number n) {
      return number(n.doubleValue());
    }
    if (value instanceof byte[] b) {
      return bytes(b);
    }
    if (value instanceof ByteBuffer buffer) {
      ByteBuffer copy = buffer.duplicate();
      byte[] b = new byte[copy.remaining()];
      copy.get(b);
      return bytes(b);
    }
    if (value instanceof Instant instant) {
      return instant(instant);
    }
    if (value instanceof Date date) {
      return instant(Instant.ofEpochMilli(date.getTime()));
    }
    if (value instanceof ZonedDateTime || value instanceof OffsetDateTime) {
      return instant(Instant.from((TemporalAccessor) value));
    }
    if (value instanceof Calendar calendar) {
      return instant(calendar.toInstant());
    }
    if (value instanceof TemporalAccessor) {
      // Local dates and times have no instant; ISO text is what they mean.
      return value.toString();
    }
    if (value instanceof Enum<?> e) {
      return e.name();
    }
    if (value instanceof Optional<?> optional) {
      return walk(optional.orElse(null), seen, depth + 1);
    }
    if (value instanceof Path
        || value instanceof File
        || value instanceof URI
        || value instanceof URL
        || value instanceof UUID) {
      return value.toString();
    }
    if (value instanceof Pattern pattern) {
      return pattern.pattern();
    }
    if (value instanceof Map
        || value instanceof Collection
        || value.getClass().isArray()
        || value instanceof Record) {
      return container(value, seen, depth);
    }
    if (value instanceof Throwable || isOpaque(value.getClass())) {
      return unserialisable(value);
    }
    return container(value, seen, depth);
  }

  /** Thrown inside normalisation when a value refers back to itself. */
  private static final class CycleFound extends RuntimeException {
    private static final long serialVersionUID = 1L;

    CycleFound() {
      super(null, null, false, false);
    }
  }

  /** A property whose getter cannot be called. */
  private enum Unreadable {
    INSTANCE
  }
}
