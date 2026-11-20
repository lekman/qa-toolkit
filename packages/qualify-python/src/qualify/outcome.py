"""Outcome classification (specification section 3.3)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pytest

from qualify.context import CheckFailed

Outcome = Literal["pass", "fail", "error", "skip"]


@dataclass(frozen=True)
class Classification:
    """The outcome of a test, with its skip reason or its first failure."""

    outcome: Outcome
    skip_reason: str | None = None
    failure_type: str | None = None
    message: str | None = None


def type_name(error: BaseException) -> str:
    """The type name recorded for an exception: its class name."""
    return type(error).__name__


def classify(error: BaseException | None) -> Classification:
    """Classify how a test body ended.

    ``pytest.skip()``, ``pytest.xfail()`` and ``ctx.skip()`` are ``skip``. A failed check, an
    ``AssertionError`` and ``pytest.fail()`` are ``fail``. Anything else is
    ``error``, with the exception's type name and message.
    """
    if error is None:
        return Classification("pass")
    if isinstance(error, pytest.skip.Exception):
        return Classification("skip", skip_reason=error.msg or "skipped")
    if isinstance(error, pytest.xfail.Exception):
        return Classification("skip", skip_reason=f"xfail: {error.msg}" if error.msg else "xfail")
    if isinstance(error, CheckFailed):
        return Classification("fail", failure_type="CheckFailed", message=error.message)
    message = str(error)
    if isinstance(error, (AssertionError, pytest.fail.Exception)):
        return Classification("fail", failure_type=type_name(error), message=message)
    return Classification("error", failure_type=type_name(error), message=message)
