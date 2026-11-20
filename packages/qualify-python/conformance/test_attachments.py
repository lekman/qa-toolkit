"""Scenario 14, attachments: inline attachments, and one over the size limit.

The harness runs each test on its own, because the limit set for OQ-CONF-016
would stop OQ-CONF-015 too.
"""

import qualify


@qualify.oq(
    "OQ-CONF-015",
    "attachments test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_attachments_within_the_limit(ctx: qualify.Context) -> None:
    ctx.attach("note.txt", "hello\n", "text/plain")
    ctx.attach("blob.bin", bytes(range(256)), "application/octet-stream")
    ctx.check("fixture", "one equals one").that(1).equals(1)


@qualify.oq(
    "OQ-CONF-016",
    "attachments test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_attachment_over_the_limit(ctx: qualify.Context) -> None:
    ctx.attach("big.txt", "a" * 17, "text/plain")
