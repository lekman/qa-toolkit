import { oq } from "@lekman/qualify/vitest";

// The harness runs OQ-CONF-015 and OQ-CONF-016 in two invocations, because
// OQ-CONF-016 needs QUALIFY_ATTACHMENT_LIMIT=16 and OQ-CONF-015 would exceed it.
oq(
  "OQ-CONF-015",
  "attachments test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.attach("note.txt", "hello\n", "text/plain");
    ctx.attach(
      "blob.bin",
      Uint8Array.from({ length: 256 }, (_, i) => i),
      "application/octet-stream",
    );
    ctx.check("fixture", "one equals one").that(1).equals(1);
  },
);

oq(
  "OQ-CONF-016",
  "attachments test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx.attach("big.txt", "a".repeat(17), "text/plain");
  },
);
