"""Scenario 3, soft-check: a failed soft check lets the body continue, then fails the test."""

import qualify


@qualify.oq(
    "OQ-CONF-003",
    "soft-check test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_soft_check(ctx: qualify.Context) -> None:
    ctx.check("fixture", "soft fails").soft().that("a").equals("b")
    ctx.check("fixture", "still runs").that(True).is_true()
