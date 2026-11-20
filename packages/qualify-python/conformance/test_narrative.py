"""Scenario 13, narrative: every string survives byte for byte in UTF-8."""

import qualify


@qualify.pq(
    "PQ-CONF-014",
    "narrative test",
    given="données d’entrée — 入力",
    when="the run 🚀 starts",
    then="“quoted” output",
    and_=["first", "second", "third — 3"],
    scope="read",
)
def test_narrative(ctx: qualify.Context) -> None:
    ctx.check("fixture", "one equals one").that(1).equals(1)
