"""Scenario 19, deselected: the runner's filter selects OQ-CONF-020 only."""

import qualify


@qualify.oq(
    "OQ-CONF-020",
    "deselected test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_selected(ctx: qualify.Context) -> None:
    pass


@qualify.oq(
    "OQ-CONF-021",
    "deselected test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_deselected(ctx: qualify.Context) -> None:
    pass
