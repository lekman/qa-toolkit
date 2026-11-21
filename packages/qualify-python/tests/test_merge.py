from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from helpers import OTHER_RUN, RUN_ID, read, record
from qualify.merge import MergeInput, build, summary

NOW = "2026-01-02T03:04:05.006Z"


def inputs(directory: Path) -> list[MergeInput]:
    folder = directory / "records"
    return [MergeInput(p.name, p.read_text("utf-8")) for p in sorted(folder.iterdir())]


def empty() -> dict[str, Any]:
    return {"id": RUN_ID, "environment": "local"}


def merge(directory: Path, allow: list[str] | None = None) -> Any:
    return build(inputs(directory), allow or [], empty, lambda: NOW)


def test_records_merge_sorted_with_a_summary(tmp_path: Path) -> None:
    record(tmp_path, "OQ-AREA-002", line=2, error=RuntimeError("boom"))
    record(tmp_path, "IQ-AREA-001", line=1)
    record(tmp_path, "OQ-AREA-003", line=3, finish=False)
    result = merge(tmp_path)
    assert result.exit_code == 1
    file = result.file
    assert [t["id"] for t in file["tests"]] == ["IQ-AREA-001", "OQ-AREA-002", "OQ-AREA-003"]
    crashed = file["tests"][2]
    assert crashed["error"] == {
        "type": "DidNotFinish",
        "message": "test started and did not finish",
        "site": None,
    }
    assert crashed["startedAt"] == crashed["endedAt"]
    assert file["summary"] == {
        "total": 3,
        "pass": 1,
        "fail": 0,
        "error": 2,
        "skip": 0,
        "verdict": "fail",
    }
    assert file["run"]["startedAt"] <= file["run"]["endedAt"]


def test_no_records_is_incomplete(tmp_path: Path) -> None:
    result = build([], [], empty, lambda: NOW)
    assert result.exit_code == 3
    assert result.file is not None
    assert result.file["run"]["startedAt"] == NOW
    assert summary([])["verdict"] == "incomplete"


def test_bad_files_are_refused(tmp_path: Path) -> None:
    good = record(tmp_path, "OQ-AREA-001")
    name = next(p.name for p in (tmp_path / "records").iterdir() if p.suffix == ".json")
    text = (tmp_path / "records" / name).read_text()
    wrong_kind = name.replace(".json", ".started")
    files = [
        MergeInput(".hidden.tmp", "ignored"),
        MergeInput("notes.txt", "x"),
        MergeInput(name, "{"),
        MergeInput(name.replace("OQ-AREA-001", "OQ-AREA-009"), text),
        MergeInput(wrong_kind, text),
        MergeInput(name.replace("OQ-AREA-001", "OQ-AREA-008"), json.dumps({"kind": "x"})),
    ]
    result = build(files, [], empty, lambda: NOW)
    assert result.exit_code == 2
    assert result.file is None
    joined = "\n".join(result.errors)
    assert "notes.txt: not a record or marker name" in joined
    assert "not valid JSON" in joined
    assert "the name does not match run" in joined
    assert "holds a record file, not a started" in joined
    assert "/kind: must be started, record or run" in joined
    assert good.finished


def test_duplicates_and_mixed_runs(tmp_path: Path) -> None:
    record(tmp_path, "OQ-AREA-001", line=1)
    record(tmp_path, "OQ-AREA-001", line=2)
    result = merge(tmp_path)
    assert result.exit_code == 2
    assert "test ID OQ-AREA-001 appears 2 times" in result.errors[0]

    other = tmp_path / "other"
    record(other, "OQ-AREA-001")
    record(other, "OQ-AREA-002", run_id=OTHER_RUN)
    assert "more than one run" in merge(other).errors[0]
    assert "names every run" in merge(other, [RUN_ID, OTHER_RUN]).errors[0]
    merged = merge(other, [OTHER_RUN])
    assert merged.exit_code == 0
    assert merged.file["run"]["mergedRuns"] == [OTHER_RUN]
    assert merged.file["run"]["id"] == RUN_ID


def test_envelopes_must_agree(tmp_path: Path) -> None:
    record(tmp_path, "OQ-AREA-001", environment="local")
    record(tmp_path, "OQ-AREA-002", environment="staging")
    errors = merge(tmp_path).errors
    assert any("disagree on environment" in e for e in errors)


def test_merge_redacts_patterns_again(tmp_path: Path) -> None:
    recorder = record(tmp_path, "OQ-AREA-001", finish=False)
    recorder.context.attach("k.txt", b"key AK" + b"IAABCDEFGHIJKLMNOP", "text/plain")
    recorder.finish(None)
    path = next(p for p in (tmp_path / "records").iterdir() if p.suffix == ".json")
    data = read(path)
    # Put a shape back, as a writer without redaction would have left it.
    data["test"]["title"] = "AK" + "IAABCDEFGHIJKLMNOP"
    data["test"]["attachments"][0]["content"] = base64.b64encode(
        b"key AK" + b"IAABCDEFGHIJKLMNOP"
    ).decode()
    path.write_text(json.dumps(data))
    test = merge(tmp_path).file["tests"][0]
    assert test["title"] == "[REDACTED]"
    assert base64.b64decode(test["attachments"][0]["content"]) == b"key [REDACTED]"
    assert test["attachments"][0]["sizeBytes"] == 14
