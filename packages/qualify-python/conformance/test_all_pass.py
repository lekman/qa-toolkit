"""Scenario 1, all-pass: two checks, both pass."""

import qualify


@qualify.iq(
    "IQ-CONF-001",
    "all-pass test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
)
def test_all_pass(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
    ctx.check("fixture", "text contains a word").that("qualify").contains("ali")
