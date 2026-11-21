"""Scenario 5, plain-assertion: a delegated helper fails with the language's own assertion."""

import qualify


def shared_helper() -> None:
    """A helper shared with unit tests. It raises AssertionError itself, because
    pytest rewrites an assert statement in a test module and adds its own
    explanation to the message."""
    raise AssertionError("helper failed")


@qualify.oq(
    "OQ-CONF-005",
    "plain-assertion test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_plain_assertion(ctx: qualify.Context) -> None:
    ctx.delegate("helper", "shared helper passes", shared_helper)
