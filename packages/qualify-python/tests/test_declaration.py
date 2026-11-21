from __future__ import annotations

import pytest

from qualify.declaration import DeclarationError, Narrative, is_test_id, validate

GOOD = Narrative(given="g", when="w", then="t", scope="read")


def problems(level: str, test_id: object, title: object, narrative: Narrative) -> tuple[str, ...]:
    with pytest.raises(DeclarationError) as raised:
        validate(level, test_id, title, narrative, "a.py:1")
    return raised.value.problems


def test_a_valid_declaration_keeps_its_fields() -> None:
    narrative = Narrative(
        given="g",
        when="w",
        then="t",
        and_=["more"],
        scope="read-write",
        requirements=["R-1"],
        risk="high",
        tags=["b", "a", "b"],
        controls="OQ-AREA-002",
    )
    declaration = validate("OQ", "OQ-AREA-001", "Title", narrative, "a.py:1")
    assert declaration.to_json() == {
        "id": "OQ-AREA-001",
        "level": "OQ",
        "title": "Title",
        "given": "g",
        "when": "w",
        "then": "t",
        "and": ["more"],
        "scope": "read-write",
        "requirements": ["R-1"],
        "risk": "high",
        "tags": ["a", "b"],
        "controls": "OQ-AREA-002",
        "site": "a.py:1",
    }


def test_iq_and_iu_have_a_fixed_scope() -> None:
    narrative = Narrative(given="g", when="w", then="t")
    assert validate("IQ", "IQ-AREA-001", "T", narrative, "a.py:1").scope == "read"
    assert validate("IU", "IU-AREA-001", "T", narrative, "a.py:1").scope == "read-write"
    assert problems("IQ", "IQ-AREA-001", "T", GOOD) == (
        "scope must not be declared for IQ tests, which are always read",
    )


def test_every_problem_is_reported_at_once() -> None:
    found = problems(
        "OQ",
        "OQ-AREA-API-001",
        "two\nlines",
        Narrative(
            given="",
            when=" ",
            then=None,
            and_=["", 3],
            scope="write",
            requirements=["R", "R", "x" * 65],
            risk="huge",
            tags=[""],
            controls="nope",
        ),
    )
    assert found == (
        "ID does not match the pattern ^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$, "
        "for example OQ-EXPORT-003",
        "title must be one line",
        "given must not be empty",
        "when must not be empty",
        "then must not be empty",
        "and_ must be a list of clauses, each not empty",
        "scope must be read or read-write",
        "each requirement ID must be 1 to 64 characters",
        "requirements are duplicated: R",
        "risk must be high, medium or low",
        "tags must be a list of strings, each not empty",
        "controls must be the ID of another qualification test",
    )


def test_level_and_prefix_problems() -> None:
    assert problems("XQ", "OQ-AREA-001", "", GOOD)[:3] == (
        "unknown level XQ",
        "ID prefix OQ does not match the declared level XQ",
        "title must not be empty",
    )
    assert problems("OQ", "OQ-AREA-001", "T", Narrative("g", "w", "t")) == (
        "scope is required for OQ tests (read or read-write)",
    )
    assert problems(
        "OQ", "OQ-AREA-001", "T", Narrative("g", "w", "t", scope="read", requirements="R")
    ) == ("requirements must be a list of requirement IDs",)
    assert problems(
        "OQ", "OQ-AREA-001", "T", Narrative("g", "w", "t", scope="read", controls="OQ-AREA-001")
    ) == ("a test cannot be the control for itself",)


def test_the_error_names_the_id() -> None:
    with pytest.raises(DeclarationError, match=r"^42: ID does not match"):
        validate("OQ", 42, "T", GOOD, "a.py:1")


def test_is_test_id() -> None:
    assert is_test_id("PQ-X1-123")
    assert not is_test_id("PQ-X-123")
    assert not is_test_id(None)
