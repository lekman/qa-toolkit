"""Scenario 17, duplicate-id: this file and its twin both declare OQ-CONF-018."""

import qualify


@qualify.oq(
    "OQ-CONF-018",
    "duplicate-id test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_duplicate_id_a(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
