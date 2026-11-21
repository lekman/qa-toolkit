"""Scenario 9, bad-id: a lower-case ID, and an ID whose prefix is not the level."""

import qualify


@qualify.oq(
    "OQ-conf-009",
    "bad-id test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_lower_case_id(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)


@qualify.oq(
    "IQ-CONF-010",
    "bad-id test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_prefix_is_not_the_level(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
