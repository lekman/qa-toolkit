"""JSON documents written the way every evidence file is written (specification 6.3).

UTF-8, two-space indent, a trailing newline, the keys of the envelope in schema
order and every other key sorted by code point. ``json.dumps`` cannot write
this: it prints ``1.0`` for a number JavaScript prints as ``1``, and it has no
per-object key order.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import TypeAlias

from qualify.values import number_text, string_text


@dataclass(frozen=True)
class Fields:
    """An object shape: its known keys in order, and the shape of each field."""

    order: tuple[str, ...]
    fields: Mapping[str, Shape] = field(default_factory=dict)


@dataclass(frozen=True)
class Items:
    """An array shape: the shape of every item."""

    item: Shape


Shape: TypeAlias = Fields | Items | None
"""How to order keys. ``None`` sorts the keys by code point at every depth."""


def _child(shape: Shape, key: str) -> Shape:
    return shape.fields.get(key) if isinstance(shape, Fields) else None


def _keys(value: Mapping[str, object], shape: Shape) -> list[str]:
    present = list(value)
    if not isinstance(shape, Fields):
        return sorted(present)
    known = [k for k in shape.order if k in value]
    return known + sorted(k for k in present if k not in shape.order)


def write(value: object, shape: Shape = None, depth: int = 0) -> str:
    """One value at an indent depth, without a trailing newline."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return number_text(value)
    if isinstance(value, str):
        return string_text(value)
    pad = "  " * (depth + 1)
    if isinstance(value, Mapping):
        keys = _keys(value, shape)
        if not keys:
            return "{}"
        lines = [
            f"{pad}{string_text(k)}: {write(value[k], _child(shape, k), depth + 1)}" for k in keys
        ]
        return "{\n" + ",\n".join(lines) + "\n" + "  " * depth + "}"
    if isinstance(value, Sequence):
        if not value:
            return "[]"
        item = shape.item if isinstance(shape, Items) else None
        lines = [f"{pad}{write(v, item, depth + 1)}" for v in value]
        return "[\n" + ",\n".join(lines) + "\n" + "  " * depth + "]"
    raise TypeError(f"cannot write {type(value).__name__} as JSON")


def document(value: object, shape: Shape = None) -> str:
    """A JSON document: the value, written with the shape, and a newline."""
    return write(value, shape) + "\n"


def _obj(*order: str, **fields: Shape) -> Fields:
    return Fields(order, fields)


_DECLARATION = (
    "id",
    "level",
    "title",
    "given",
    "when",
    "then",
    "and",
    "scope",
    "requirements",
    "risk",
    "tags",
    "controls",
    "site",
)
_CHECK = _obj(
    "seq",
    "context",
    "description",
    "matcher",
    "expected",
    "actual",
    "pass",
    "soft",
    "site",
    "delegate",
    "at",
)
_TEST = Fields(
    (
        *_DECLARATION,
        "outcome",
        "skipReason",
        "error",
        "startedAt",
        "endedAt",
        "durationMs",
        "checks",
        "attachments",
        "secretsUsed",
    ),
    {
        "error": _obj("type", "message", "site"),
        "checks": Items(_CHECK),
        "attachments": Items(
            _obj("filename", "contentType", "encoding", "content", "sizeBytes", "sha256")
        ),
    },
)
_RUN = _obj(
    "id",
    "environment",
    "tool",
    "source",
    "actor",
    "target",
    "policy",
    "selection",
    "startedAt",
    "endedAt",
    "mergedRuns",
    tool=_obj("name", "version", "language", "runtime"),
    source=_obj("commit", "branch", "dirty"),
    actor=_obj("name", "ci", "ciRunUrl"),
    policy=_obj("productionWriteBlocked", "overrides", overrides=Items(_obj("id", "reason"))),
    selection=_obj("levels", "ids", "tags", "excludeTags"),
)

EVIDENCE_SHAPE: Shape = _obj(
    "schemaVersion",
    "kind",
    "run",
    "summary",
    "tests",
    "test",
    run=_RUN,
    summary=_obj("total", "pass", "fail", "error", "skip", "verdict"),
    tests=Items(_TEST),
    test=_TEST,
)
"""Key order of every evidence file: the order of ``evidence.schema.json``."""

_ROW = _obj(
    "requirement",
    "sources",
    "testId",
    "level",
    "title",
    "risk",
    "controls",
    "outcome",
    "run",
    "environment",
)
TRACE_SHAPE: Shape = _obj(
    "schemaVersion",
    "kind",
    "inputs",
    "runs",
    "summary",
    "rows",
    "notRun",
    "requirementsWithoutPass",
    inputs=Items(_obj("path", "role", "sha256")),
    runs=Items(_obj("id", "environment", "commit", "verdict")),
    summary=_obj(
        "tests",
        "pass",
        "fail",
        "error",
        "skip",
        "notRun",
        "requirements",
        "requirementsWithoutPass",
        "verdict",
    ),
    rows=Items(_ROW),
)
"""Key order of a ``trace.json`` file, used by the conformance harness."""
