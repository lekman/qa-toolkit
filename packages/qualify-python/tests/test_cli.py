from __future__ import annotations

import io
import json
import subprocess
import sys
from pathlib import Path

import pytest

from helpers import RUN_ID, record
from qualify import cli, schema

REPO = Path(__file__).resolve().parents[3]
SPEC = REPO / "spec" / "qualify"
PACKAGED = Path(schema.__file__).parent / "schemas"


def call(*args: str, cwd: Path, env: dict[str, str] | None = None) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    code = cli.run(list(args), cli.IO(env=env or {}, cwd=lambda: str(cwd), stdout=out, stderr=err))
    return code, out.getvalue(), err.getvalue()


@pytest.mark.skipif(not SPEC.is_dir(), reason="needs the repository's spec folder")
@pytest.mark.parametrize("name", ["evidence.schema.json", "trace.schema.json"])
def test_the_packaged_schemas_equal_the_specification(name: str) -> None:
    assert (PACKAGED / name).read_bytes() == (SPEC / name).read_bytes()


def test_help_version_and_usage(tmp_path: Path) -> None:
    code, out, _ = call("--help", cwd=tmp_path)
    assert code == 0
    assert "qualify merge" in out
    code, out, _ = call("--version", cwd=tmp_path)
    assert code == 0
    assert out.strip()
    for args in ([], ["nope"], ["merge", "--bad"], ["merge", "--allow-runs", "x"], ["validate"]):
        code, _, err = call(*args, cwd=tmp_path)
        assert code == 64, args
        assert "Usage:" in err
    code, _, err = call("validate", "--strict", cwd=tmp_path)
    assert code == 64


def test_trace_points_to_the_typescript_package(tmp_path: Path) -> None:
    code, _, err = call("trace", "x.json", cwd=tmp_path)
    assert code == 64
    assert "npx @lekman/qualify trace" in err


def test_merge_writes_the_run_file_and_sidecar(tmp_path: Path) -> None:
    record(tmp_path / "ev", "OQ-AREA-001")
    code, out, _ = call("merge", "--evidence-dir", "ev", cwd=tmp_path)
    assert code == 0
    assert "1 tests, 1 pass" in out
    run_file = tmp_path / "ev" / "test-evidence.json"
    sidecar = (tmp_path / "ev" / "test-evidence.json.sha256").read_text()
    assert sidecar.endswith("  test-evidence.json\n")
    code, out, _ = call("validate", str(run_file), cwd=tmp_path)
    assert code == 0
    assert out.startswith("valid:")
    run_file.write_text(run_file.read_text() + " ")
    code, _, err = call("validate", str(run_file), cwd=tmp_path)
    assert code == 2
    assert "does not match" in err


def test_merge_uses_the_environment_and_an_out_file(tmp_path: Path) -> None:
    env = {"QUALIFY_EVIDENCE_DIR": "ev", "QUALIFY_RUN_ID": RUN_ID}
    code, _out, _ = call("merge", "--out", "run.json", cwd=tmp_path, env=env)
    assert code == 3
    data = json.loads((tmp_path / "run.json").read_text())
    assert data["run"]["id"] == RUN_ID
    assert data["run"]["tool"]["runtime"].endswith("; qualify merge")
    assert data["summary"]["verdict"] == "incomplete"


def test_merge_refuses_invalid_input(tmp_path: Path) -> None:
    (tmp_path / "records").mkdir()
    (tmp_path / "records" / "junk.txt").write_text("x")
    code, _, err = call("merge", "--evidence-dir", ".", cwd=tmp_path)
    assert code == 2
    assert "no run file written" in err
    assert not (tmp_path / "test-evidence.json").exists()
    code, _, err = call(
        "merge", "--evidence-dir", "x", cwd=tmp_path, env={"QUALIFY_ALLOW_WRITE": "x"}
    )
    assert code == 2
    assert "not a test ID" in err


def test_validate_reports_each_file(tmp_path: Path) -> None:
    (tmp_path / "bad.json").write_text("{")
    (tmp_path / "wrong.json").write_text('{"kind": "run"}')
    (tmp_path / "trace.json").write_text('{"kind": "trace"}')
    code, out, err = call(
        "validate", "bad.json", "wrong.json", "trace.json", "missing.json", cwd=tmp_path
    )
    assert code == 2
    assert "bad.json: not valid JSON" in err
    assert "wrong.json: /:" in err
    assert "trace.json: /:" in err
    assert "cannot read missing.json" in err
    assert out == ""


def test_the_console_script_runs() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "qualify", "--version"], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0
    assert result.stdout.strip()
