from __future__ import annotations

from typing import Any

import pytest

from qualify import trace

RUN = "01HQA1ZQJ0C0NF0RMANCE00000"


def entry(test_id: str, outcome: str = "pass", **extra: Any) -> dict[str, Any]:
    return {
        "id": test_id,
        "level": test_id[:2],
        "title": f"title {test_id}",
        "requirements": [],
        "outcome": outcome,
        **extra,
    }


def run(*tests: dict[str, Any]) -> dict[str, Any]:
    return {"run": {"id": RUN}, "tests": list(tests)}


def test_links_come_from_code_protocol_and_map() -> None:
    protocol = trace.read_protocol(
        """
tests:
  - id: OQ-AREA-001
    title: one
    level: OQ
    requirements: [R-2, R-1]
    risk: high
  - id: OQ-AREA-009
    title: never ran
    level: OQ
""",
        "protocol.yaml",
    )
    mapped = trace.read_map("OQ-AREA-001: R-3\nOQ-AREA-009: [R-9]\n", "trace.yaml")
    matrix = trace.build(run(entry("OQ-AREA-001", requirements=["R-1"])), protocol, mapped)
    assert [(r.requirement, r.sources, r.test_id, r.risk, r.outcome) for r in matrix.rows] == [
        ("R-1", ("code", "protocol"), "OQ-AREA-001", "high", "pass"),
        ("R-2", ("protocol",), "OQ-AREA-001", "high", "pass"),
        ("R-3", ("map",), "OQ-AREA-001", "high", "pass"),
        ("R-9", ("map",), "OQ-AREA-009", None, "not-run"),
    ]
    assert matrix.not_run == ["OQ-AREA-009"]
    assert matrix.without_pass == ["R-9"]


def test_a_control_sits_after_the_test_it_controls() -> None:
    matrix = trace.build(
        run(
            entry("OQ-AREA-003", controls="OQ-AREA-001"),
            entry("OQ-AREA-002"),
            entry("OQ-AREA-001", "fail"),
        )
    )
    assert [r.test_id for r in matrix.rows] == ["OQ-AREA-001", "OQ-AREA-003", "OQ-AREA-002"]
    assert matrix.rows[0].requirement is None


def test_yaml_reads_as_yaml_1_2() -> None:
    entries = trace.read_protocol(
        "tests:\n  - {id: OQ-AREA-001, title: yes, level: OQ, requirements: [2026-01-02]}\n", "p"
    )
    assert entries[0].title == "yes"
    assert entries[0].requirements == ("2026-01-02",)
    assert trace.read_map("", "m") == {}


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("tests: [", "not valid YAML"),
        ("other: 1", 'must have a "tests" list'),
        ("tests: [1]", "must be a mapping"),
        ("tests: [{id: OQ-AREA-001, title: t, level: OQ, owner: x}]", "unknown field owner"),
        ("tests: [{id: nope, title: t, level: OQ}]", "id must be a test ID"),
        ("tests: [{id: OQ-AREA-001, title: t, level: IQ}]", "level must be the prefix"),
        ("tests: [{id: OQ-AREA-001, title: ' ', level: OQ}]", "title must not be empty"),
        ("tests: [{id: OQ-AREA-001, title: t, level: OQ, risk: huge}]", "risk must be"),
        (
            "tests: [{id: OQ-AREA-001, title: t, level: OQ},"
            " {id: OQ-AREA-001, title: t, level: OQ}]",
            "listed twice",
        ),
        (
            "tests: [{id: OQ-AREA-001, title: t, level: OQ, requirements: [a, a]}]",
            "a requirement is listed twice",
        ),
        (
            "tests: [{id: OQ-AREA-001, title: t, level: OQ, requirements: [1]}]",
            "1 to 64 characters",
        ),
    ],
)
def test_invalid_protocols(text: str, message: str) -> None:
    with pytest.raises(trace.TraceInputError, match=message):
        trace.read_protocol(text, "p")


@pytest.mark.parametrize(
    ("text", "message"), [("- a", "must map test IDs"), ("nope: a", "nope is not a test ID")]
)
def test_invalid_maps(text: str, message: str) -> None:
    with pytest.raises(trace.TraceInputError, match=message):
        trace.read_map(text, "m")
