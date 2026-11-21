"""Scenario 6, runtime-skip: ctx.skip records the skip and ends the body."""

import qualify


@qualify.oq(
    "OQ-CONF-006",
    "runtime-skip test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_runtime_skip(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
    ctx.skip("fixture not seeded")
