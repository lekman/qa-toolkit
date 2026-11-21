"""Scenario 10, secret-redaction: a secret never reaches any file of the evidence."""

import qualify


@qualify.oq(
    "OQ-CONF-011",
    "secret-redaction test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_secret_redaction(ctx: qualify.Context) -> None:
    t = ctx.secret("CONFORMANCE_TOKEN")
    ctx.check("api", "token " + t + " is used").that("Bearer " + t).contains(t)
    ctx.attach("request.json", {"url": "/x", "token": t, "note": "x " + t}, "application/json")
    ctx.attach("raw.bin", b"\x00\xff" + t.encode("utf-8") + b"\x00", "application/octet-stream")
    raise RuntimeError("failed with " + t)
