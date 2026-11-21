"""``qualify merge``: the run file from records and markers (specification section 6.5)."""

from __future__ import annotations

import base64
import hashlib
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from qualify import redaction, schema
from qualify.evidence import parse_name
from qualify.values import key_text

_AGREE = ("environment", "source", "policy")


@dataclass(frozen=True)
class MergeInput:
    """One file of the records directory: its name and its text."""

    name: str
    text: str


@dataclass
class MergeResult:
    """The run file, or the reasons there is none. ``exit_code`` follows section 8."""

    exit_code: int
    file: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)


@dataclass
class _Pair:
    marker: tuple[str, dict[str, Any]] | None = None
    record: tuple[str, dict[str, Any]] | None = None

    def files(self) -> list[tuple[str, dict[str, Any]]]:
        return [f for f in (self.marker, self.record) if f is not None]


def summary(tests: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Counts and verdict: ``fail`` on any fail or error, ``incomplete`` with no tests."""
    counts = {
        o: sum(1 for t in tests if t["outcome"] == o) for o in ("pass", "fail", "error", "skip")
    }
    verdict = "fail" if counts["fail"] + counts["error"] else "incomplete" if not tests else "pass"
    return {"total": len(tests), **counts, "verdict": verdict}


def _defend(test: dict[str, Any]) -> dict[str, Any]:
    """Apply the pattern rules again, decoding attachments to redact their bytes."""
    rest = {k: v for k, v in test.items() if k != "attachments"}
    result: dict[str, Any] = redaction.value(rest)  # type: ignore[assignment]
    attachments = []
    for attachment in test["attachments"]:
        raw = base64.b64decode(attachment["content"])
        clean = redaction.data(raw)
        if clean != raw:
            attachment = {
                **attachment,
                "content": base64.b64encode(clean).decode("ascii"),
                "sizeBytes": len(clean),
                "sha256": hashlib.sha256(clean).hexdigest(),
            }
        attachments.append(dict(attachment))
    result["attachments"] = attachments
    return result


def _did_not_finish(marker: dict[str, Any]) -> dict[str, Any]:
    test = dict(marker["test"])
    started = test.pop("startedAt")
    test.update(
        outcome="error",
        error={"type": "DidNotFinish", "message": "test started and did not finish", "site": None},
        startedAt=started,
        endedAt=started,
        durationMs=0,
        checks=[],
        attachments=[],
        secretsUsed=[],
    )
    return test


def build(
    inputs: Sequence[MergeInput],
    allow_runs: Sequence[str],
    empty_envelope: Callable[[], dict[str, Any]],
    now: Callable[[], str],
) -> MergeResult:
    """Merge the files of one records directory. Pure: the caller reads and writes."""
    errors: list[str] = []
    pairs: dict[str, _Pair] = {}
    for item in sorted(inputs, key=lambda i: i.name):
        if item.name.startswith("."):
            continue
        name = parse_name(item.name)
        if name is None:
            errors.append(
                f"{item.name}: not a record or marker name "
                "(<runId>__<testId>__<key>.json or .started)"
            )
            continue
        try:
            data = json.loads(item.text)
        except ValueError as error:
            errors.append(f"{item.name}: not valid JSON ({error})")
            continue
        problems = schema.evidence(data)
        if problems:
            errors.extend(f"{item.name}: {p}" for p in problems)
            continue
        if data["kind"] != name.kind:
            errors.append(f"{item.name}: holds a {data['kind']} file, not a {name.kind}")
            continue
        if data["run"]["id"] != name.run_id or data["test"]["id"] != name.test_id:
            errors.append(
                f"{item.name}: the name does not match run {data['run']['id']} "
                f"and test {data['test']['id']}"
            )
            continue
        pair = pairs.setdefault(name.stem, _Pair())
        if name.kind == "started":
            pair.marker = (item.name, data)
        else:
            pair.record = (item.name, data)
    if errors:
        return MergeResult(2, errors=errors)

    every = [f for pair in pairs.values() for f in pair.files()]
    ids = sorted({f["run"]["id"] for _, f in every})
    primaries = [i for i in ids if i not in allow_runs]
    if len(primaries) > 1:
        return MergeResult(
            2,
            errors=[
                f"records come from more than one run ({', '.join(primaries)}); "
                "name the runs to merge in with --allow-runs"
            ],
        )
    if not primaries and ids:
        return MergeResult(
            2, errors=["--allow-runs names every run in the directory; leave the main run out"]
        )
    primary = primaries[0] if primaries else None

    by_id: dict[str, list[str]] = {}
    for stem, pair in pairs.items():
        test_id = pair.files()[0][1]["test"]["id"]
        by_id.setdefault(test_id, []).append(stem)
    for test_id, stems in by_id.items():
        if len(stems) > 1:
            errors.append(
                f"test ID {test_id} appears {len(stems)} times in the run "
                f"({', '.join(stems)}); an ID must be unique within a run"
            )
    if every:
        first_name, first = every[0]
        for name_of_field in _AGREE:
            expected = key_text(first["run"][name_of_field])
            for other_name, other in every:
                if key_text(other["run"][name_of_field]) != expected:
                    errors.append(
                        f"the run envelopes disagree on {name_of_field}: "
                        f"{first_name} and {other_name}"
                    )
                    break
    if errors:
        return MergeResult(2, errors=errors)

    tests = sorted(
        (
            _defend(pair.record[1]["test"] if pair.record else _did_not_finish(pair.marker[1]))  # type: ignore[index]
            for pair in pairs.values()
        ),
        key=lambda t: t["id"],
    )
    of_primary = sorted(
        (f for _, f in every if f["run"]["id"] == primary), key=lambda f: f["test"]["id"]
    )
    base = dict(of_primary[0]["run"]) if of_primary else empty_envelope()
    selection = base.pop("selection", None)
    run: dict[str, Any] = redaction.value(base)  # type: ignore[assignment]
    if selection is not None and len({key_text(f["run"].get("selection")) for _, f in every}) == 1:
        run["selection"] = selection
    stamp = now()
    run["startedAt"] = min((t["startedAt"] for t in tests), default=stamp)
    run["endedAt"] = max((t["endedAt"] for t in tests), default=stamp)
    merged = [i for i in ids if i != primary]
    if merged:
        run["mergedRuns"] = merged
    totals = summary(tests)
    file = {"schemaVersion": 1, "kind": "run", "run": run, "summary": totals, "tests": tests}
    code = {"fail": 1, "incomplete": 3}.get(totals["verdict"], 0)
    return MergeResult(code, file=file)
