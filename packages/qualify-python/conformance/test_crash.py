"""Scenario 18, crash: the process ends abruptly after the started marker is written."""

import os

import qualify


@qualify.oq(
    "OQ-CONF-019",
    "crash test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_crash(ctx: qualify.Context) -> None:
    # os._exit ends the process at once: no exception, no pytest hook, no
    # record. Only the marker written when the test started remains.
    os._exit(70)
