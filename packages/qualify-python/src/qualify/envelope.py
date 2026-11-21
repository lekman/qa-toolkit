"""The run envelope every evidence file carries (specification section 6.4)."""

from __future__ import annotations

import os
import platform
import re
import secrets
import subprocess
import time
from collections.abc import Mapping
from dataclasses import dataclass
from importlib import metadata

import pytest

TOOL_NAME = "lekman-qualify"
_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_TARGET_PREFIX = "QUALIFY_TARGET_"
_ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_ULID = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")


def tool_version() -> str:
    """The installed version of this package."""
    try:
        return metadata.version(TOOL_NAME)
    except metadata.PackageNotFoundError:
        return "0.0.0+unknown"


def runtime(runner: str) -> str:
    """``python <version>; <runner>``, for ``run.tool.runtime``."""
    return f"python {platform.python_version()}; {runner}"


def pytest_runtime() -> str:
    """The runtime string of a test run under pytest."""
    return runtime(f"pytest {pytest.__version__}")


def tool(runner_runtime: str) -> dict[str, str]:
    """``run.tool`` for this package."""
    return {
        "name": TOOL_NAME,
        "version": tool_version(),
        "language": "python",
        "runtime": runner_runtime,
    }


def create_ulid(now_ms: int | None = None, random: bytes | None = None) -> str:
    """A ULID: 48 bits of milliseconds and 80 random bits, in Crockford base32."""
    millis = int(time.time() * 1000) if now_ms is None else now_ms
    entropy = secrets.token_bytes(10) if random is None else random
    if not 0 <= millis < 2**48:
        raise ValueError("ULID time must be a 48-bit count of milliseconds")
    if len(entropy) != 10:
        raise ValueError("ULID randomness must be 10 bytes")
    number = (millis << 80) | int.from_bytes(entropy, "big")
    chars = []
    for _ in range(26):
        chars.append(_ULID_ALPHABET[number & 31])
        number >>= 5
    return "".join(reversed(chars))


def is_ulid(value: object) -> bool:
    """Whether a value is a ULID."""
    return isinstance(value, str) and _ULID.match(value) is not None


@dataclass(frozen=True)
class GitFacts:
    """What git says about the working tree. Every value is ``None`` without git."""

    root: str | None
    commit: str | None
    branch: str | None
    dirty: bool | None


def _git(cwd: str, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def read_git(cwd: str) -> GitFacts:
    """Read the commit, branch and state of the tracked files.

    ``dirty`` counts tracked files only: the evidence directory usually sits
    untracked inside the repository and would change it partway through a run.
    """
    root = _git(cwd, "rev-parse", "--show-toplevel")
    if root is None:
        return GitFacts(None, None, None, None)
    status = _git(cwd, "status", "--porcelain", "--untracked-files=no")
    return GitFacts(
        root=os.path.normpath(root),
        commit=_git(cwd, "rev-parse", "HEAD"),
        branch=_git(cwd, "symbolic-ref", "--quiet", "--short", "HEAD"),
        dirty=None if status is None else status != "",
    )


def _value(text: str | None) -> str | None:
    return None if text is None or text == "" else text


def actor(env: Mapping[str, str]) -> dict[str, str | None]:
    """Who ran the tests: the GitHub Actions actor and run, or ``USER`` outside CI."""
    if env.get("GITHUB_ACTIONS") == "true":
        server = _value(env.get("GITHUB_SERVER_URL"))
        repository = _value(env.get("GITHUB_REPOSITORY"))
        run_id = _value(env.get("GITHUB_RUN_ID"))
        url = (
            f"{server}/{repository}/actions/runs/{run_id}"
            if server and repository and run_id
            else None
        )
        return {"name": _value(env.get("GITHUB_ACTOR")), "ci": "github-actions", "ciRunUrl": url}
    name = _value(env.get("USER")) or _value(env.get("USERNAME"))
    return {"name": name, "ci": None, "ciRunUrl": None}


def source(git: GitFacts, env: Mapping[str, str]) -> dict[str, object]:
    """The code under test. A detached head on GitHub Actions takes the branch
    from ``GITHUB_HEAD_REF`` or ``GITHUB_REF_NAME``."""
    commit = git.commit if git.commit is not None and _COMMIT.match(git.commit) else None
    branch = _value(git.branch)
    if branch is None and git.commit is not None and env.get("GITHUB_ACTIONS") == "true":
        branch = _value(env.get("GITHUB_HEAD_REF")) or _value(env.get("GITHUB_REF_NAME"))
    return {"commit": commit, "branch": branch, "dirty": git.dirty}


def target(env: Mapping[str, str]) -> dict[str, str | None]:
    """``QUALIFY_TARGET_<NAME>`` variables as ``target.<name>``; an empty one is ``None``."""
    result: dict[str, str | None] = {}
    for name, text in env.items():
        if name.startswith(_TARGET_PREFIX) and len(name) > len(_TARGET_PREFIX):
            result[name[len(_TARGET_PREFIX) :].lower()] = _value(text)
    return result


def build(
    *,
    run_id: str,
    environment: str,
    policy: dict[str, object],
    git: GitFacts,
    env: Mapping[str, str],
    runner_runtime: str,
) -> dict[str, object]:
    """The full run envelope."""
    return {
        "id": run_id,
        "environment": environment,
        "tool": tool(runner_runtime),
        "source": source(git, env),
        "actor": actor(env),
        "target": target(env),
        "policy": policy,
    }
