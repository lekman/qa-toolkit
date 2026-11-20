from __future__ import annotations

from collections.abc import Iterator

import pytest

from qualify import redaction, runtime


@pytest.fixture(autouse=True)
def clean_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Every test starts with no registered secrets, no options and no QUALIFY_* variable."""
    import os

    for name in list(os.environ):
        if name.startswith(("QUALIFY_", "PYTEST_ADDOPTS")):
            monkeypatch.delenv(name)
    redaction.registry.clear()
    runtime.reset()
    yield
    redaction.registry.clear()
    runtime.reset()
