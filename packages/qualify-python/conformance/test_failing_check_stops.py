"""Scenario 2, failing-check-stops: a failed hard check ends the body."""

import qualify


@qualify.oq(
    "OQ-CONF-002",
    "failing-check-stops test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_failing_check_stops(ctx: qualify.Context) -> None:
    ctx.check("fixture", "first passes").that(1).equals(1)
    ctx.check("fixture", "second fails").that(2).equals(3)
    ctx.check("fixture", "third never runs").that(4).equals(4)
