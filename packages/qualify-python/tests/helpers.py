"""Builds real evidence files with the recorder, for the merge and CLI tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from qualify import envelope
from qualify.declaration import Narrative, validate
from qualify.recorder import Recorder
from qualify.runtime import Process
from qualify.settings import resolve

RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000"
OTHER_RUN = "01HQA1ZQJ0C0NF0RMANCE00001"


def process(directory: Path, run_id: str = RUN_ID, environment: str = "local") -> Process:
    settings = resolve({"QUALIFY_ENVIRONMENT": environment, "QUALIFY_EVIDENCE_DIR": str(directory)})
    run = envelope.build(
        run_id=run_id,
        environment=settings.environment,
        policy=settings.policy(),
        git=envelope.GitFacts(None, None, None, None),
        env={},
        runner_runtime="python; pytest",
    )
    return Process(settings, run, str(directory), str(directory))


def record(
    directory: Path,
    test_id: str = "OQ-AREA-001",
    *,
    line: int = 1,
    error: BaseException | None = None,
    finish: bool = True,
    run_id: str = RUN_ID,
    environment: str = "local",
) -> Recorder:
    level = test_id[:2]
    narrative = Narrative("g", "w", "t", scope="read" if level in ("OQ", "PQ") else None)
    declaration = validate(level, test_id, "title", narrative, f"tests/test_x.py:{line}")
    recorder = Recorder(declaration, process(directory, run_id, environment), "tests/test_x.py")
    recorder.start()
    if finish:
        recorder.finish(error)
    return recorder


def read(path: Path) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(path.read_text("utf-8"))
    return data
