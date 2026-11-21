"""The decorators that declare a qualification test: ``iq``, ``oq``, ``pq`` and ``iu``."""

from __future__ import annotations

import inspect
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TypeVar

import pytest

from qualify.declaration import Declaration, DeclarationError, Narrative, validate
from qualify.site import format_site

F = TypeVar("F", bound=Callable[..., object])

ATTRIBUTE = "__qualify__"
"""The attribute a decorated function carries its declaration under."""


@dataclass(frozen=True)
class Declared:
    """A declaration as the decorator received it. The plugin validates it at
    collection, when it knows the repository root the site is relative to."""

    level: str
    id: object
    title: object
    narrative: Narrative
    file: str
    line: int
    timeout_ms: object = None

    def declaration(self, root: str) -> Declaration:
        """Validate the declaration. Raises :class:`DeclarationError`."""
        if self.timeout_ms is not None and (
            not isinstance(self.timeout_ms, (int, float))
            or isinstance(self.timeout_ms, bool)
            or self.timeout_ms <= 0
        ):
            shown = self.id if isinstance(self.id, str) else repr(self.id)
            raise DeclarationError(shown, ["timeout_ms must be a positive number"])
        return validate(
            self.level, self.id, self.title, self.narrative, format_site(self.file, self.line, root)
        )


def declared(obj: object) -> Declared | None:
    """The declaration a function carries, if it is a qualification test."""
    try:
        value = inspect.getattr_static(obj, ATTRIBUTE, None)
    except Exception:  # pragma: no cover - an object whose attribute lookup itself fails
        return None
    return value if isinstance(value, Declared) else None


def _declare(
    level: str,
    test_id: str,
    title: str,
    narrative: Narrative,
    timeout_ms: float | None,
) -> Callable[[F], F]:
    def decorate(fn: F) -> F:
        if not callable(fn):
            raise TypeError(f"qualify.{level.lower()}() decorates a test function")
        code = getattr(inspect.unwrap(fn), "__code__", None)
        file = code.co_filename if code is not None else inspect.getfile(fn)
        line = code.co_firstlineno if code is not None else 0
        setattr(fn, ATTRIBUTE, Declared(level, test_id, title, narrative, file, line, timeout_ms))
        marked = pytest.mark.qualify(fn)
        marked = getattr(pytest.mark, level.lower())(marked)
        if isinstance(timeout_ms, (int, float)) and timeout_ms > 0:
            marked = pytest.mark.timeout(timeout_ms / 1000)(marked)
        return marked  # type: ignore[no-any-return]

    return decorate


def iq(
    test_id: str,
    title: str,
    *,
    given: str,
    when: str,
    then: str,
    and_: Sequence[str] | None = None,
    requirements: Sequence[str] | None = None,
    risk: str | None = None,
    tags: Sequence[str] | None = None,
    controls: str | None = None,
    timeout_ms: float | None = None,
) -> Callable[[F], F]:
    """Declare an Installation Qualification test. IQ tests are always ``read``."""
    narrative = Narrative(given, when, then, and_, None, requirements, risk, tags, controls)
    return _declare("IQ", test_id, title, narrative, timeout_ms)


def oq(
    test_id: str,
    title: str,
    *,
    given: str,
    when: str,
    then: str,
    scope: str | None = None,
    and_: Sequence[str] | None = None,
    requirements: Sequence[str] | None = None,
    risk: str | None = None,
    tags: Sequence[str] | None = None,
    controls: str | None = None,
    timeout_ms: float | None = None,
) -> Callable[[F], F]:
    """Declare an Operational Qualification test. ``scope`` is ``read`` or ``read-write``.

    The test receives the ``ctx`` fixture beside its ordinary fixtures. pytest
    selects it by ID (``-k OQ-EXPORT-003``), by level (``-m oq``) and by each
    tag (``-m <tag>``). ``and_`` holds further clauses after ``then``.
    ``timeout_ms`` becomes a ``pytest.mark.timeout`` marker, which the
    pytest-timeout plugin applies when it is installed.
    """
    narrative = Narrative(given, when, then, and_, scope, requirements, risk, tags, controls)
    return _declare("OQ", test_id, title, narrative, timeout_ms)


def pq(
    test_id: str,
    title: str,
    *,
    given: str,
    when: str,
    then: str,
    scope: str | None = None,
    and_: Sequence[str] | None = None,
    requirements: Sequence[str] | None = None,
    risk: str | None = None,
    tags: Sequence[str] | None = None,
    controls: str | None = None,
    timeout_ms: float | None = None,
) -> Callable[[F], F]:
    """Declare a Performance Qualification test. ``scope`` is ``read`` or ``read-write``."""
    narrative = Narrative(given, when, then, and_, scope, requirements, risk, tags, controls)
    return _declare("PQ", test_id, title, narrative, timeout_ms)


def iu(
    test_id: str,
    title: str,
    *,
    given: str,
    when: str,
    then: str,
    and_: Sequence[str] | None = None,
    requirements: Sequence[str] | None = None,
    risk: str | None = None,
    tags: Sequence[str] | None = None,
    controls: str | None = None,
    timeout_ms: float | None = None,
) -> Callable[[F], F]:
    """Declare an Intended Use test. IU tests are always ``read-write``."""
    narrative = Narrative(given, when, then, and_, None, requirements, risk, tags, controls)
    return _declare("IU", test_id, title, narrative, timeout_ms)
