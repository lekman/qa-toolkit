"""Scenario 15, value-normalisation: each value compared with itself after normalisation."""

import datetime as dt

import qualify


@qualify.oq(
    "OQ-CONF-017",
    "value-normalisation test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_value_normalisation(ctx: qualify.Context) -> None:
    data = b"\x01\x02"
    instant = dt.datetime(2026, 1, 2, 3, 4, 5, 6000, tzinfo=dt.timezone.utc)
    big = 2**60
    nan = float("nan")
    mapping = {"b": 1, "a": {"d": 2, "c": 3}}
    strings = {"b", "a"}
    cycle: list[object] = []
    cycle.append(cycle)

    ctx.check("value", "bytes").that(data).equals(data)
    ctx.check("value", "instant").that(instant).equals(instant)
    ctx.check("value", "big integer").that(big).equals(big)
    ctx.check("value", "NaN").that(nan).equals(nan)
    ctx.check("value", "map").that(mapping).equals(mapping)
    ctx.check("value", "set").that(strings).equals(strings)
    ctx.check("value", "cycle").that(cycle).equals(cycle)
