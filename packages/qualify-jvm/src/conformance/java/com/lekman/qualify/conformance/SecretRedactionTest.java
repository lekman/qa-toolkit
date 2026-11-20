package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/** Scenario 10, {@code secret-redaction}. */
class SecretRedactionTest {
  @OQ(
      id = "OQ-CONF-011",
      title = "secret-redaction test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void secretRedaction(QualifyContext ctx) {
    String t = ctx.secret("CONFORMANCE_TOKEN");
    ctx.check("api", "token " + t + " is used").that("Bearer " + t).contains(t);
    Map<String, Object> request = new LinkedHashMap<>();
    request.put("url", "/x");
    request.put("token", t);
    request.put("note", "x " + t);
    ctx.attach("request.json", request, "application/json");
    ByteArrayOutputStream raw = new ByteArrayOutputStream();
    raw.write(0x00);
    raw.write(0xFF);
    raw.writeBytes(t.getBytes(StandardCharsets.UTF_8));
    raw.write(0x00);
    ctx.attach("raw.bin", raw.toByteArray(), "application/octet-stream");
    throw new IllegalStateException("failed with " + t);
  }
}
