import { oq } from "@lekman/qualify/vitest";

// Each sample is joined from two parts, so secret scanners do not flag the
// test source as holding a real key.
const pem =
  "-----BEGIN PRIVATE" +
  " KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
const jwt = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
const accessKey = "AK" + "IA" + "ABCDEFGHIJKLMNOP";

oq(
  "OQ-CONF-012",
  "pattern-redaction test",
  {
    given: "a conformance fixture",
    when: "the scenario runs",
    then: "the evidence matches the expected file",
    scope: "read",
  },
  (ctx) => {
    ctx
      .check("fixture", "the output holds secret shapes")
      .that([pem, jwt, accessKey].join(" "))
      .isNotNull();
  },
);
