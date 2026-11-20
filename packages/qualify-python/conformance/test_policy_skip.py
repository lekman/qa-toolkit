"""Scenario 7, policy-skip: a read-write test in production is skipped unless overridden."""

import qualify


@qualify.oq(
    "OQ-CONF-007",
    "policy-skip test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read-write",
)
def test_policy_skip(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
