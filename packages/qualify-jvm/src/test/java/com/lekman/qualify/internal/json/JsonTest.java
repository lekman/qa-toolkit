package com.lekman.qualify.internal.json;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JsonTest {

  @Test
  void numbersAreWrittenAsJavaScriptWritesThem() {
    assertEquals("1", JsonNumbers.format(1.0));
    assertEquals("0", JsonNumbers.format(-0.0));
    assertEquals("0.1", JsonNumbers.format(0.1));
    assertEquals("-2.5", JsonNumbers.format(-2.5));
    assertEquals("0.30000000000000004", JsonNumbers.format(0.1 + 0.2));
    assertEquals("123456789012345680000", JsonNumbers.format(123456789012345680000.0));
    assertEquals("1e+21", JsonNumbers.format(1e21));
    assertEquals("1.5e+300", JsonNumbers.format(1.5e300));
    assertEquals("0.000001", JsonNumbers.format(1e-6));
    assertEquals("1e-7", JsonNumbers.format(1e-7));
    assertEquals("5e-324", JsonNumbers.format(Double.MIN_VALUE));
    assertEquals("null", JsonNumbers.format(Double.NaN));
    assertEquals("null", JsonNumbers.format(Double.POSITIVE_INFINITY));
  }

  @Test
  void stringsAreEscapedAsJsonStringifyDoes() {
    assertEquals("\"a\\\"b\\\\c\\n\\r\\t\\b\\f\\u0001/\"", Json.quote("a\"b\\c\n\r\t\b\f\u0001/"));
    assertEquals("\"🚀 — 入力\"", Json.quote("🚀 — 入力"));
    assertEquals("\"\\ud800x\\udc00\"", Json.quote("\ud800x\udc00"));
  }

  @Test
  void documentsFollowTheShapeThenSortByCodePoint() {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("z", 1L);
    value.put("b", List.of());
    value.put("a", Map.of());
    value.put("🚀", true);
    value.put("￿", null);
    String doc = Json.document(value, Shape.object("z"));
    assertEquals(
        "{\n  \"z\": 1,\n  \"a\": {},\n  \"b\": [],\n  \"￿\": null,\n  \"🚀\": true\n}\n", doc);
    assertEquals("[\n  1.5,\n  \"x\"\n]\n", Json.document(List.of(1.5, "x")));
  }

  @Test
  void codePointOrderDiffersFromUtf16() {
    assertTrue(Json.compare("￿", "🚀") < 0);
    assertTrue(Json.compare("a", "ab") < 0);
    assertTrue(Json.compare("ab", "a") > 0);
    assertEquals(0, Json.compare("same", "same"));
  }

  @Test
  void parsingKeepsIntegersAsLongsAndRejectsBadText() throws JsonFormatException {
    Object parsed =
        Json.parse(
            "{\"a\": 1, \"b\": 1.0, \"c\": 1.5, \"d\": 99999999999999999999, \"e\": [null, false]}");
    Map<?, ?> map = (Map<?, ?>) parsed;
    assertEquals(1L, map.get("a"));
    assertEquals(1L, map.get("b"));
    assertEquals(1.5, map.get("c"));
    assertEquals(new BigInteger("99999999999999999999"), map.get("d"));
    assertEquals(Arrays.asList(null, false), map.get("e"));
    assertEquals(
        "{\"a\":1,\"b\":1,\"c\":1.5,\"d\":99999999999999999999,\"e\":[null,false]}",
        Json.compact(parsed));
    assertThrows(JsonFormatException.class, () -> Json.parse("{"));
    assertThrows(JsonFormatException.class, () -> Json.parse("{} {}"));
    assertEquals(null, Json.fromNode(null));
    assertEquals("[1]", Json.compact(Json.fromNode(Json.toNode(new ArrayList<>(List.of(1L))))));
    assertThrows(IllegalArgumentException.class, () -> Json.compact(new Object()));
  }
}
