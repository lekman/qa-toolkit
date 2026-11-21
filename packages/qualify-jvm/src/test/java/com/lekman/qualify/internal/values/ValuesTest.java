package com.lekman.qualify.internal.values;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.internal.json.Json;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class ValuesTest {

  /** A record with nested values. */
  record Payment(String currency, BigDecimal amount, List<Integer> parts) {}

  /** A bean as Kotlin data classes and POJOs look from Java. */
  public static class Bean {
    public String getName() {
      return "acme";
    }

    public boolean isActive() {
      return true;
    }

    public String getURL() {
      return "https://example.com";
    }

    public int getsNothing() {
      return 0;
    }
  }

  /** A bean whose getter throws. */
  public static class Broken {
    public String getValue() {
      throw new IllegalStateException("no");
    }
  }

  /** An object with nothing to read. */
  public static class Opaque {}

  enum Colour {
    RED
  }

  private static String n(Object value) {
    return Json.compact(Values.normalise(value));
  }

  @Test
  @SuppressWarnings("UnnecessaryStringBuilder") // a CharSequence that is not a String, on purpose
  void scalarsNormalise() {
    assertEquals("null", n(null));
    assertEquals("\"x\"", n('x'));
    assertEquals("\"sb\"", n(new StringBuilder("sb")));
    assertEquals("7", n((byte) 7));
    assertEquals("9007199254740992", n(1L << 53));
    assertEquals("\"9007199254740993\"", n((1L << 53) + 1));
    assertEquals("\"-1152921504606846976\"", n(-(1L << 60)));
    assertEquals(
        "\"123456789012345678901234567890\"", n(new BigInteger("123456789012345678901234567890")));
    assertEquals("12", n(new BigDecimal("12.000")));
    assertEquals("100.5", n(new BigDecimal("100.50")));
    assertEquals("0.1", n(0.1f));
    assertEquals("\"NaN\"", n(Float.NaN));
    assertEquals("\"Infinity\"", n(Double.POSITIVE_INFINITY));
    assertEquals("\"-Infinity\"", n(Double.NEGATIVE_INFINITY));
    assertEquals("\"1180591620717411303424\"", n(Math.pow(2, 70)));
    assertEquals("3", n(new AtomicLong(3)));
    assertEquals("\"RED\"", n(Colour.RED));
    assertEquals("null", n(Optional.empty()));
    assertEquals("1", n(Optional.of(1)));
    assertEquals("\"a/b\"", n(Path.of("a/b")));
    assertEquals("\"urn:x\"", n(URI.create("urn:x")));
    assertEquals("\"00000000-0000-0000-0000-000000000000\"", n(new UUID(0, 0)));
    assertEquals("\"\\\\d+\"", n(Pattern.compile("\\d+")));
    assertEquals("\"2026-01-02\"", n(LocalDate.of(2026, 1, 2)));
  }

  @Test
  @SuppressWarnings("JavaUtilDate") // java.util.Date is a value a test may check
  void bytesAndInstantsNormalise() {
    assertEquals("{\"$bytes\":\"AQI=\"}", n(new byte[] {1, 2}));
    assertEquals("{\"$bytes\":\"AQI=\"}", n(ByteBuffer.wrap(new byte[] {1, 2})));
    assertEquals("\"1970-01-01T00:00:00.000Z\"", n(new Date(0)));
    assertEquals(
        "\"2026-01-02T01:04:05.000Z\"",
        n(OffsetDateTime.of(2026, 1, 2, 3, 4, 5, 0, ZoneOffset.ofHours(2))));
    Calendar calendar = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
    calendar.setTimeInMillis(6);
    assertEquals("\"1970-01-01T00:00:00.006Z\"", n(calendar));
    assertEquals("\"[unserialisable: Instant]\"", n(Instant.parse("+12000-01-01T00:00:00Z")));
  }

  @Test
  void containersNormalise() {
    Map<Object, Object> map = new LinkedHashMap<>();
    map.put("b", List.of(1, 2));
    map.put(1, "one");
    map.put(Colour.RED, new int[] {3, 4});
    assertEquals("{\"1\":\"one\",\"RED\":[3,4],\"b\":[1,2]}", n(map));
    assertEquals("[1,2,10]", n(new LinkedHashSet<>(List.of(10, 2, 1))));
    assertEquals("[\"a\",1,true]", n(new LinkedHashSet<>(List.of(true, "a", 1))));
    assertEquals("[\"x\",null]", n(new Object[] {"x", null}));
    assertEquals(
        "{\"amount\":12.5,\"currency\":\"EUR\",\"parts\":[1]}",
        n(new Payment("EUR", new BigDecimal("12.5"), List.of(1))));
    assertEquals(
        "{\"URL\":\"https://example.com\",\"active\":true,\"name\":\"acme\"}", n(new Bean()));
  }

  @Test
  void unserialisableValuesNameTheirType() {
    assertEquals("\"[unserialisable: Broken]\"", n(new Broken()));
    assertEquals("\"[unserialisable: Opaque]\"", n(new Opaque()));
    assertEquals("\"[unserialisable: IllegalStateException]\"", n(new IllegalStateException()));
    assertEquals("\"[unserialisable: Thread]\"", n(Thread.currentThread()));
    List<Object> cycle = new ArrayList<>();
    cycle.add(List.of(cycle));
    assertEquals("\"[unserialisable: ArrayList]\"", n(cycle));
    List<Object> deep = new ArrayList<>();
    List<Object> at = deep;
    for (int i = 0; i < 150; i++) {
      List<Object> next = new ArrayList<>();
      at.add(next);
      at = next;
    }
    assertEquals("\"[unserialisable: ArrayList]\"", n(deep));
    assertEquals("null", Values.typeName(null));
    Object anonymous = new Object() {};
    assertEquals(anonymous.getClass().getName(), Values.typeName(anonymous));
  }

  @Test
  void equalityComparesNormalisedValues() {
    assertTrue(Values.equal(Double.NaN, Double.NaN));
    assertTrue(Values.equal(1, 1L));
    assertTrue(Values.equal(Set.of("a", "b"), List.of("a", "b")));
    assertFalse(Values.equal(1, "1"));
    Opaque one = new Opaque();
    assertTrue(Values.equal(one, one));
    assertFalse(Values.equal(one, new Opaque()));
  }

  @Test
  void lengthCountsCodePointsAndElements() {
    assertEquals(3L, Values.lengthOf("ab🚀"));
    assertEquals(2L, Values.lengthOf(List.of(1, 2)));
    assertEquals(1L, Values.lengthOf(Map.of("a", 1)));
    assertEquals(4L, Values.lengthOf(new byte[4]));
    assertNull(Values.lengthOf(5));
    assertNull(Values.lengthOf(null));
    assertEquals(
        "2026-01-02T03:04:05.006Z", Values.timestamp(Instant.parse("2026-01-02T03:04:05.006Z")));
  }
}
