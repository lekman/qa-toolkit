"""Scenario 4, thrown-error: a plain runtime error is the outcome error."""

import qualify


@qualify.oq(
    "OQ-CONF-004",
    "thrown-error test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_thrown_error(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
    raise RuntimeError("boom")
