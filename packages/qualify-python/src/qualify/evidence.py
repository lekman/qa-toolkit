"""Evidence file names and the atomic writer (specification sections 6.1 and 6.3)."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

RUN_FILE = "test-evidence.json"
RECORDS = "records"

_NAME = re.compile(
    r"^([0-9A-HJKMNP-TV-Z]{26})__((?:IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,})"
    r"__([0-9a-f]{8})\.(started|json)$"
)


def key(site: str) -> str:
    """The first 8 hex digits of the SHA-256 of a declaration's site.

    A retried test overwrites its own files; a second declaration of the same
    ID writes beside them, so ``merge`` can refuse the duplicate.
    """
    return hashlib.sha256(site.encode("utf-8")).hexdigest()[:8]


def marker_name(run_id: str, test_id: str, site: str) -> str:
    """``<runId>__<testId>__<key>.started``"""
    return f"{run_id}__{test_id}__{key(site)}.started"


def record_name(run_id: str, test_id: str, site: str) -> str:
    """``<runId>__<testId>__<key>.json``"""
    return f"{run_id}__{test_id}__{key(site)}.json"


@dataclass(frozen=True)
class EvidenceName:
    """A record or marker file name, split into its parts."""

    run_id: str
    test_id: str
    key: str
    kind: Literal["started", "record"]

    @property
    def stem(self) -> str:
        """The name without its extension: a marker and its record share it."""
        return f"{self.run_id}__{self.test_id}__{self.key}"


def parse_name(name: str) -> EvidenceName | None:
    """Split a record or marker file name, or ``None`` for any other name."""
    match = _NAME.match(name)
    if match is None:
        return None
    run_id, test_id, digest, ext = match.groups()
    return EvidenceName(run_id, test_id, digest, "started" if ext == "started" else "record")


def sidecar(content: bytes, file_name: str) -> str:
    """The ``.sha256`` sidecar text: digest, two spaces, file name, newline."""
    return f"{hashlib.sha256(content).hexdigest()}  {file_name}\n"


def write_atomic(path: str | Path, content: str | bytes) -> None:
    """Write to a hidden temporary file in the same folder, flush, then rename.

    ``merge`` ignores names that start with a dot, so an interrupted write
    leaves nothing it would read.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    data = content.encode("utf-8") if isinstance(content, str) else content
    temporary = target.parent / f".{target.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp"
    try:
        with temporary.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
