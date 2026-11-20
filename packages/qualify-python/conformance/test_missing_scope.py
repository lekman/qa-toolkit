"""Scenario 8, missing-scope: an OQ test without a scope is a declaration error."""

import qualify


@qualify.oq(
    "OQ-CONF-008",
    "missing-scope test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
)
def test_missing_scope(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
