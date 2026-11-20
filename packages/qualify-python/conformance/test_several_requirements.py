"""Scenario 12, several-requirements: the record holds the code's requirements only."""

import qualify


@qualify.oq(
    "OQ-CONF-013",
    "several-requirements test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
    requirements=["REQ-1", "REQ-2"],
)
def test_several_requirements(ctx: qualify.Context) -> None:
    pass
