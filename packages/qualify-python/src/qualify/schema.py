"""Validation against the normative JSON Schemas (specification section 10).

The schemas are copies of ``spec/qualify/*.schema.json``; a test keeps them equal.
"""

from __future__ import annotations

import json
from functools import cache
from importlib import resources
from typing import Any

from jsonschema import Draft202012Validator

_KINDS = {"started": "startedFile", "record": "recordFile", "run": "runFile"}


@cache
def _load(name: str) -> dict[str, Any]:
    text = resources.files("qualify.schemas").joinpath(name).read_text("utf-8")
    loaded: dict[str, Any] = json.loads(text)
    return loaded


@cache
def _validator(name: str, definition: str | None) -> Draft202012Validator:
    schema = _load(name)
    if definition is not None:
        schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": f"#/$defs/{definition}",
        }
    return Draft202012Validator(schema)


def _problems(validator: Draft202012Validator, data: object) -> list[str]:
    problems = []
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        path = "/" + "/".join(str(p) for p in error.absolute_path)
        problems.append(f"{path}: {error.message}")
    return problems


def evidence(data: object) -> list[str]:
    """Problems with an evidence file (marker, record or run file); empty when valid.

    The file's ``kind`` picks the part of the schema the problems are reported
    against, so a reader sees the field that is wrong rather than three failed
    alternatives. Test IDs must also start with their level.
    """
    if not isinstance(data, dict):
        return ["/: must be a JSON object"]
    kind = data.get("kind")
    definition = _KINDS.get(kind) if isinstance(kind, str) else None
    if definition is None:
        return ["/kind: must be started, record or run"]
    problems = _problems(_validator("evidence.schema.json", definition), data)
    if not problems:
        # The kind's own part of the schema, then the whole schema, which stays normative.
        problems = _problems(_validator("evidence.schema.json", None), data) or _levels(data)
    return problems


def trace(data: object) -> list[str]:
    """Problems with a ``trace.json`` file; empty when valid."""
    return _problems(_validator("trace.schema.json", None), data)


def theme(data: object) -> list[str]:
    """Problems with a report theme file; empty when valid."""
    return _problems(_validator("report-theme.schema.json", None), data)


def _levels(data: dict[str, Any]) -> list[str]:
    tests = data.get("tests") or ([data["test"]] if "test" in data else [])
    return [
        f"test {t['id']} does not match its level {t['level']}"
        for t in tests
        if not str(t["id"]).startswith(f"{t['level']}-")
    ]
