"""Test declarations, specification sections 2.1 and 4."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, cast, get_args

Level = Literal["IQ", "OQ", "PQ", "IU"]
Scope = Literal["read", "read-write"]
Risk = Literal["high", "medium", "low"]

LEVELS: tuple[Level, ...] = get_args(Level)
ID_PATTERN = re.compile(r"^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$")


class DeclarationError(Exception):
    """A declaration that cannot be used. The test fails at collection and writes no evidence."""

    def __init__(self, test_id: str, problems: Sequence[str]) -> None:
        self.test_id = test_id
        self.problems = tuple(problems)
        super().__init__(f"{test_id}: " + "; ".join(self.problems))


def is_test_id(value: object) -> bool:
    """Whether a value is a valid test ID for any level."""
    return isinstance(value, str) and ID_PATTERN.match(value) is not None


@dataclass(frozen=True)
class Declaration:
    """A validated declaration: the fields shared by the started marker and the record."""

    id: str
    level: Level
    title: str
    given: str
    when: str
    then: str
    scope: Scope
    requirements: tuple[str, ...]
    tags: tuple[str, ...]
    site: str
    and_: tuple[str, ...] | None = None
    risk: Risk | None = None
    controls: str | None = None

    def to_json(self) -> dict[str, object]:
        """The declaration as the evidence files hold it."""
        result: dict[str, object] = {
            "id": self.id,
            "level": self.level,
            "title": self.title,
            "given": self.given,
            "when": self.when,
            "then": self.then,
            "scope": self.scope,
            "requirements": list(self.requirements),
            "tags": list(self.tags),
            "site": self.site,
        }
        if self.and_ is not None:
            result["and"] = list(self.and_)
        if self.risk is not None:
            result["risk"] = self.risk
        if self.controls is not None:
            result["controls"] = self.controls
        return result


@dataclass(frozen=True)
class Narrative:
    """What a decorator received, before validation. Every field is unchecked."""

    given: object
    when: object
    then: object
    and_: object = None
    scope: object = None
    requirements: object = None
    risk: object = None
    tags: object = None
    controls: object = None


def _text(value: object) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _strings(value: object) -> list[str] | None:
    """The value as a list of strings, or ``None`` when it is not one."""
    if isinstance(value, (list, tuple)) and all(isinstance(v, str) for v in value):
        return [str(v) for v in value]
    return None


def _scope(level: str, value: object, problems: list[str]) -> Scope | None:
    if level in ("IQ", "IU"):
        if value is not None:
            always = "read" if level == "IQ" else "read-write"
            problems.append(
                f"scope must not be declared for {level} tests, which are always {always}"
            )
        return "read" if level == "IQ" else "read-write"
    if value is None:
        problems.append(f"scope is required for {level} tests (read or read-write)")
        return None
    if value not in ("read", "read-write"):
        problems.append("scope must be read or read-write")
        return None
    return value


def _requirements(value: object, problems: list[str]) -> tuple[str, ...]:
    if value is None:
        return ()
    items = _strings(value)
    if items is None:
        problems.append("requirements must be a list of requirement IDs")
        return ()
    if any(not 1 <= len(r) <= 64 for r in items):
        problems.append("each requirement ID must be 1 to 64 characters")
    duplicates = sorted({r for r in items if items.count(r) > 1})
    if duplicates:
        problems.append(f"requirements are duplicated: {', '.join(duplicates)}")
    return tuple(items)


def _tags(value: object, problems: list[str]) -> tuple[str, ...]:
    if value is None:
        return ()
    tags = _strings(value)
    if tags is None or any(t == "" for t in tags):
        problems.append("tags must be a list of strings, each not empty")
        return ()
    return tuple(sorted(set(tags)))


def validate(
    level: str, test_id: object, title: object, narrative: Narrative, site: str
) -> Declaration:
    """Validate a declaration, collecting every problem into one :class:`DeclarationError`."""
    problems: list[str] = []
    shown = test_id if isinstance(test_id, str) else repr(test_id)
    if level not in LEVELS:
        problems.append(f"unknown level {level}")
    if not is_test_id(test_id):
        problems.append(
            f"ID does not match the pattern {ID_PATTERN.pattern}, for example OQ-EXPORT-003"
        )
    elif not str(test_id).startswith(f"{level}-"):
        problems.append(f"ID prefix {str(test_id)[:2]} does not match the declared level {level}")
    if not _text(title):
        problems.append("title must not be empty")
    elif "\n" in str(title) or "\r" in str(title):
        problems.append("title must be one line")
    for name in ("given", "when", "then"):
        if not _text(getattr(narrative, name)):
            problems.append(f"{name} must not be empty")
    clauses = _strings(narrative.and_)
    if narrative.and_ is not None and (clauses is None or not all(_text(c) for c in clauses)):
        problems.append("and_ must be a list of clauses, each not empty")
    scope = _scope(level, narrative.scope, problems)
    requirements = _requirements(narrative.requirements, problems)
    if narrative.risk is not None and narrative.risk not in ("high", "medium", "low"):
        problems.append("risk must be high, medium or low")
    tags = _tags(narrative.tags, problems)
    if narrative.controls is not None and not is_test_id(narrative.controls):
        problems.append("controls must be the ID of another qualification test")
    elif narrative.controls is not None and narrative.controls == test_id:
        problems.append("a test cannot be the control for itself")
    if problems:
        raise DeclarationError(shown, problems)
    return Declaration(
        id=str(test_id),
        level=cast(Level, level),
        title=str(title),
        given=str(narrative.given),
        when=str(narrative.when),
        then=str(narrative.then),
        scope=cast(Scope, scope),
        requirements=requirements,
        tags=tags,
        site=site,
        and_=tuple(clauses) if clauses is not None else None,
        risk=cast("Risk | None", narrative.risk),
        controls=cast("str | None", narrative.controls),
    )
