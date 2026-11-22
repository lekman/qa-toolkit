import qualify


@qualify.pq(
    "PQ-EXPORT-001",
    "A day of payments exports within a minute",
    given="a day of ten thousand payments",
    when="the export runs",
    then="the bank file is written within 60 seconds",
    requirements=["EXPORT-010"],
    risk="medium",
    scope="read",
)
def test_export_is_fast(ctx: qualify.Context) -> None:
    ctx.check("export", "finishes in time").that(42).at_most(60)
