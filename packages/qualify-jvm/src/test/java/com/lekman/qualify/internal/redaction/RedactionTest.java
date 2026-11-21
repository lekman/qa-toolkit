package com.lekman.qualify.internal.redaction;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lekman.qualify.internal.json.Json;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RedactionTest {

  // Samples are joined from two parts so secret scanners do not flag this file.
  private static final String KEY = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
  private static final String JWT = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2ln";

  @Test
  void registeredValuesGoLongestFirst() {
    assertEquals(
        "x [REDACTED] y", Redaction.text("x secret-long y", List.of("secret", "secret-long")));
    assertEquals("[REDACTED] [REDACTED]", Redaction.text(KEY + " " + JWT, List.of()));
  }

  @Test
  void pemBlocksAreRedactedToTheirEndOrTheEndOfText() {
    String pem = "-----BEGIN RSA PRIVATE" + " KEY-----\nabc\n-----END RSA PRIVATE KEY----- tail";
    assertEquals("[REDACTED] tail", Redaction.patterns(pem));
    String cut = "head -----BEGIN PRIVATE" + " KEY-----\nabc\nmore";
    assertEquals("head [REDACTED]", Redaction.patterns(cut));
  }

  @Test
  void bytesKeepTheirNeighbours() {
    byte[] bytes = {0, (byte) 0xFF, 'v', 'a', 'l', 'u', 'e', '1', 0};
    byte[] redacted = Redaction.bytes(bytes, List.of("value1"));
    byte[] wanted = new byte[13];
    wanted[1] = (byte) 0xFF;
    System.arraycopy("[REDACTED]".getBytes(StandardCharsets.US_ASCII), 0, wanted, 2, 10);
    assertArrayEquals(wanted, redacted);
    byte[] clean = {1, 2, 3};
    assertSame(clean, Redaction.bytes(clean, List.of("nothing")));
  }

  @Test
  void jsonRedactsSensitiveKeysWhole() {
    Object redacted =
        Redaction.json(
            Map.of(
                "Token", Map.of("a", 1), "list", List.of("x secret1"), "apiKey", "k", "plain", 2L),
            List.of("secret1"));
    assertEquals(
        "{\"Token\":\"[REDACTED]\",\"apiKey\":\"[REDACTED]\",\"list\":[\"x"
            + " [REDACTED]\"],\"plain\":2}",
        Json.compact(redacted));
    assertEquals(
        "{\"[REDACTED]\":[\"[REDACTED]\"]}",
        Json.compact(Redaction.value(Map.of("secret1", List.of("secret1")), List.of("secret1"))));
  }

  @Test
  void theRegistryRefusesShortValues() {
    SecretRegistry registry = new SecretRegistry();
    assertFalse(registry.add("short"));
    assertTrue(registry.add("long-enough"));
    assertTrue(registry.add("long-enough"));
    assertEquals(List.of("long-enough"), registry.values());
  }
}
