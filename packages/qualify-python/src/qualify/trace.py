"""The trace matrix the report shows (specification section 8): protocol and map
inputs, and the rows linking requirements to results.

The ``trace`` command itself is in the TypeScript package; this module builds
the same rows for ``qualify report``.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import yaml

from qualify.declaration import is_test_id

SOURCES = ("code", "protocol", "map")


class TraceInputError(Exception):
    """A protocol or map file that cannot be used. Exit 2."""


class _Loader(yaml.SafeLoader):
    """YAML with the core schema of YAML 1.2, as the TypeScript CLI reads it:
    ``yes``, ``no``, ``on`` and ``off`` and dates stay strings."""


_Loader.yaml_implicit_resolvers = {}
for _tag, _pattern, _first in (
    ("bool", r"^(?:true|True|TRUE|false|False|FALSE)$", "tTfF"),
    ("null", r"^(?:~|null|Null|NULL|)$", "~nN"),
    ("int", r"^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$", "-+0123456789"),
    (
        "float",
        r"^(?:[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?"
        r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$",
        "-+0123456789.",
    ),
):
    _Loader.add_implicit_resolver(
        f"tag:yaml.org,2002:{_tag}",
        re.compile(_pattern),
        [*_first, ""] if _tag == "null" else list(_first),
    )


def _read(text: str, path: str) -> Any:
    try:
        return yaml.load(text, Loader=_Loader)
    except yaml.YAMLError as error:
        raise TraceInputError(f"{path}: not valid YAML ({error})") from error


def _requirements(value: object, where: str) -> list[str]:
    items = [value] if isinstance(value, str) else value
    if not isinstance(items, list) or any(
        not isinstance(r, str) or not 1 <= len(r) <= 64 for r in items
    ):
        raise TraceInputError(
            f"{where}: requirements must be requirement IDs of 1 to 64 characters"
        )
    if len(set(items)) != len(items):
        raise TraceInputError(f"{where}: a requirement is listed twice")
    return list(items)


@dataclass(frozen=True)
class ProtocolEntry:
    """One test the protocol requires."""

    id: str
    level: str
    title: str
    requirements: tuple[str, ...] = ()
    risk: str | None = None


def read_map(text: str, path: str) -> dict[str, list[str]]:
    """``trace.yaml``: a mapping from test ID to one requirement ID or a list."""
    data = _read(text, path)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise TraceInputError(f"{path}: must map test IDs to requirement IDs")
    result = {}
    for test_id, value in data.items():
        if not is_test_id(test_id):
            raise TraceInputError(f"{path}: {test_id} is not a test ID")
        result[test_id] = _requirements(value, f"{path}: {test_id}")
    return result


def read_protocol(text: str, path: str) -> list[ProtocolEntry]:
    """``protocol.yaml``: the tests that must run, under a ``tests`` key."""
    data = _read(text, path)
    if not isinstance(data, dict) or not isinstance(data.get("tests"), list):
        raise TraceInputError(f'{path}: must have a "tests" list')
    seen: set[str] = set()
    entries = []
    for index, raw in enumerate(data["tests"]):
        where = f"{path}: tests[{index}]"
        if not isinstance(raw, dict):
            raise TraceInputError(f"{where}: must be a mapping")
        for key in raw:
            if key not in ("id", "level", "requirements", "risk", "title"):
                raise TraceInputError(f"{where}: unknown field {key}")
        test_id, level, title, risk = (raw.get(k) for k in ("id", "level", "title", "risk"))
        if not is_test_id(test_id):
            raise TraceInputError(f"{where}: id must be a test ID")
        if not isinstance(level, str) or not str(test_id).startswith(f"{level}-"):
            raise TraceInputError(f"{where}: level must be the prefix of {test_id}")
        if not isinstance(title, str) or not title.strip():
            raise TraceInputError(f"{where}: title must not be empty")
        if risk is not None and risk not in ("high", "medium", "low"):
            raise TraceInputError(f"{where}: risk must be high, medium or low")
        if test_id in seen:
            raise TraceInputError(f"{path}: {test_id} is listed twice")
        seen.add(str(test_id))
        requirements = (
            ()
            if raw.get("requirements") is None
            else tuple(_requirements(raw["requirements"], where))
        )
        entries.append(ProtocolEntry(str(test_id), level, title, requirements, risk))
    return entries


@dataclass(frozen=True)
class Row:
    """One row of the matrix."""

    requirement: str | None
    sources: tuple[str, ...]
    test_id: str
    level: str
    title: str
    risk: str | None
    controls: str | None
    outcome: str
    run: str | None


@dataclass
class Matrix:
    """The rows, the protocol IDs with no record, and the requirements with no passing test."""

    rows: list[Row] = field(default_factory=list)
    not_run: list[str] = field(default_factory=list)
    without_pass: list[str] = field(default_factory=list)


def _links(
    code: Sequence[str], protocol: Sequence[str], mapped: Sequence[str]
) -> list[tuple[str | None, tuple[str, ...]]]:
    links: dict[str, set[str]] = {}
    for requirements, source in ((code, "code"), (protocol, "protocol"), (mapped, "map")):
        for requirement in requirements:
            links.setdefault(requirement, set()).add(source)
    if not links:
        return [(None, ())]
    return [(r, tuple(s for s in SOURCES if s in found)) for r, found in links.items()]


def build(
    run: Mapping[str, Any],
    protocol: Sequence[ProtocolEntry] = (),
    mapped: Mapping[str, Sequence[str]] | None = None,
) -> Matrix:
    """The matrix of one run file, as ``qualify trace`` builds it."""
    entries = {entry.id: entry for entry in protocol}
    mapped = mapped or {}
    run_id = run["run"]["id"]
    rows: list[Row] = []
    for test in run["tests"]:
        entry = entries.get(test["id"])
        for requirement, sources in _links(
            test["requirements"], entry.requirements if entry else (), mapped.get(test["id"], ())
        ):
            rows.append(
                Row(
                    requirement,
                    sources,
                    test["id"],
                    test["level"],
                    test["title"],
                    test.get("risk") or (entry.risk if entry else None),
                    test.get("controls"),
                    test["outcome"],
                    run_id,
                )
            )
    seen = {t["id"] for t in run["tests"]}
    not_run = sorted(i for i in entries if i not in seen)
    for test_id in not_run:
        entry = entries[test_id]
        for requirement, sources in _links((), entry.requirements, mapped.get(test_id, ())):
            rows.append(
                Row(
                    requirement,
                    sources,
                    test_id,
                    entry.level,
                    entry.title,
                    entry.risk,
                    None,
                    "not-run",
                    None,
                )
            )
    present = {(r.requirement, r.test_id) for r in rows}

    def anchor(row: Row) -> str:
        if row.controls is not None and (row.requirement, row.controls) in present:
            return row.controls
        return row.test_id

    rows.sort(
        key=lambda r: (
            r.requirement is None,
            r.requirement or "",
            anchor(r),
            anchor(r) != r.test_id,
            r.test_id,
            r.run is None,
            r.run or "",
        )
    )
    requirements = sorted({r.requirement for r in rows if r.requirement is not None})
    without_pass = [
        req
        for req in requirements
        if not any(r.requirement == req and r.outcome == "pass" for r in rows)
    ]
    return Matrix(rows, not_run, without_pass)
