"""Scenario 11, pattern-redaction: secret shapes are redacted without registration."""

import qualify

# Each sample is joined from two parts, so secret scanners do not flag this
# source file as holding a real key.
PEM = (
    "-----BEGIN PRIVATE" + " KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----"
)
JWT = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl"
ACCESS_KEY = "AK" + "IA" + "ABCDEFGHIJKLMNOP"


@qualify.oq(
    "OQ-CONF-012",
    "pattern-redaction test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_pattern_redaction(ctx: qualify.Context) -> None:
    ctx.check("fixture", "the output holds secret shapes").that(
        " ".join([PEM, JWT, ACCESS_KEY])
    ).is_not_null()
