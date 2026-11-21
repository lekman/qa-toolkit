from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

import pytest

from qualify import envelope
from qualify.evidence import key, marker_name, parse_name, record_name, sidecar, write_atomic

RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000"


def test_actor_on_github_actions() -> None:
    env = {
        "GITHUB_ACTIONS": "true",
        "GITHUB_ACTOR": "octo",
        "GITHUB_SERVER_URL": "https://github.com",
        "GITHUB_REPOSITORY": "acme/app",
        "GITHUB_RUN_ID": "42",
    }
    assert envelope.actor(env) == {
        "name": "octo",
        "ci": "github-actions",
        "ciRunUrl": "https://github.com/acme/app/actions/runs/42",
    }
    assert envelope.actor({"GITHUB_ACTIONS": "true"})["ciRunUrl"] is None


def test_actor_outside_ci() -> None:
    assert envelope.actor({"USERNAME": "dev"}) == {"name": "dev", "ci": None, "ciRunUrl": None}
    assert envelope.actor({})["name"] is None


def test_source_takes_the_branch_from_github_on_a_detached_head() -> None:
    commit = "a" * 40
    git = envelope.GitFacts("/r", commit, None, False)
    env = {"GITHUB_ACTIONS": "true", "GITHUB_REF_NAME": "main"}
    assert envelope.source(git, env) == {"commit": commit, "branch": "main", "dirty": False}
    bad = envelope.GitFacts("/r", "short", "dev", None)
    assert envelope.source(bad, {}) == {"commit": None, "branch": "dev", "dirty": None}


def test_target_from_variables() -> None:
    env = {
        "QUALIFY_TARGET_DIGEST": "sha256:x",
        "QUALIFY_TARGET_IMAGE_TAG": "",
        "QUALIFY_TARGET_": "x",
    }
    assert envelope.target(env) == {"digest": "sha256:x", "image_tag": None}


def test_ulid() -> None:
    assert envelope.create_ulid(0, bytes(10)) == "0" * 26
    assert envelope.create_ulid(1, b"\xff" * 10) == "0000000001ZZZZZZZZZZZZZZZZ"
    assert envelope.is_ulid(envelope.create_ulid())
    assert not envelope.is_ulid("01HQA1ZQJ0C0NF0RMANCE0000I")
    with pytest.raises(ValueError, match="48-bit"):
        envelope.create_ulid(2**48)
    with pytest.raises(ValueError, match="10 bytes"):
        envelope.create_ulid(0, b"")


def test_read_git_in_a_repository(tmp_path: Path) -> None:
    def git(*args: str) -> None:
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    assert envelope.read_git(str(tmp_path)) == envelope.GitFacts(None, None, None, None)
    git("init", "-q", "-b", "main")
    git(
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "x",
    )
    (tmp_path / "untracked.txt").write_text("x")
    facts = envelope.read_git(str(tmp_path))
    assert facts.root == str(tmp_path.resolve())
    assert facts.branch == "main"
    assert facts.dirty is False
    assert facts.commit is not None
    assert len(facts.commit) == 40


def test_tool() -> None:
    tool = envelope.tool(envelope.pytest_runtime())
    assert tool["name"] == "lekman-qualify"
    assert tool["language"] == "python"
    assert tool["runtime"].startswith("python 3.")
    assert "; pytest " in tool["runtime"]


def test_file_names() -> None:
    assert key("a.py:1") == hashlib.sha256(b"a.py:1").hexdigest()[:8]
    marker = marker_name(RUN_ID, "OQ-AREA-001", "a.py:1")
    record = record_name(RUN_ID, "OQ-AREA-001", "a.py:1")
    parsed = parse_name(marker)
    assert parsed is not None
    assert parsed.kind == "started"
    assert parsed.stem == record.removesuffix(".json")
    assert parse_name("other.json") is None
    assert sidecar(b"", "f") == (
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  f\n"
    )


def test_write_atomic_leaves_no_temporary_file(tmp_path: Path) -> None:
    target = tmp_path / "deep" / "file.json"
    write_atomic(target, "text")
    write_atomic(target, b"bytes")
    assert target.read_bytes() == b"bytes"
    assert [p.name for p in target.parent.iterdir()] == ["file.json"]
