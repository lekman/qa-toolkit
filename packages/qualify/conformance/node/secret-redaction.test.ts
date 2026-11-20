import { oq } from "@lekman/qualify/node";

oq(
  "OQ-CONF-011",
  "secret-redaction test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    const t = ctx.secret("CONFORMANCE_TOKEN");
    ctx
      .check("api", "token " + t + " is used")
      .that("Bearer " + t)
      .contains(t);
    ctx.attach(
      "request.json",
      { url: "/x", token: t, note: "x " + t },
      "application/json",
    );
    ctx.attach(
      "raw.bin",
      new Uint8Array([0x00, 0xff, ...new TextEncoder().encode(t), 0x00]),
      "application/octet-stream",
    );
    throw new Error("failed with " + t);
  },
);
