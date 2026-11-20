"""Scenario 20, control-pair: a negative test and its control."""

import qualify


@qualify.oq(
    "OQ-CONF-022",
    "an unsigned call is refused",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_unsigned_call_is_refused(ctx: qualify.Context) -> None:
    pass


@qualify.oq(
    "OQ-CONF-023",
    "a signed call is accepted",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
    controls="OQ-CONF-022",
)
def test_signed_call_is_accepted(ctx: qualify.Context) -> None:
    pass
