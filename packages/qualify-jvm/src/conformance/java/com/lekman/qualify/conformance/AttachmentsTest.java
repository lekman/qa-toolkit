package com.lekman.qualify.conformance;

import static com.lekman.qualify.conformance.Fixture.GIVEN;
import static com.lekman.qualify.conformance.Fixture.THEN;
import static com.lekman.qualify.conformance.Fixture.WHEN;

import com.lekman.qualify.OQ;
import com.lekman.qualify.QualifyContext;
import com.lekman.qualify.Scope;

/**
 * Scenario 14, {@code attachments}. The harness runs the two tests in two launcher runs, because
 * OQ-CONF-016 needs QUALIFY_ATTACHMENT_LIMIT=16 and OQ-CONF-015 would exceed it.
 */
class AttachmentsTest {
  @OQ(
      id = "OQ-CONF-015",
      title = "attachments test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void withinLimit(QualifyContext ctx) {
    ctx.attach("note.txt", "hello\n", "text/plain");
    byte[] blob = new byte[256];
    for (int i = 0; i < blob.length; i++) {
      blob[i] = (byte) i;
    }
    ctx.attach("blob.bin", blob, "application/octet-stream");
    ctx.check("fixture", "one equals one").that(1).isEqualTo(1);
  }

  @OQ(
      id = "OQ-CONF-016",
      title = "attachments test",
      given = GIVEN,
      when = WHEN,
      then = THEN,
      scope = Scope.READ)
  void overLimit(QualifyContext ctx) {
    ctx.attach("big.txt", "a".repeat(17), "text/plain");
  }
}
