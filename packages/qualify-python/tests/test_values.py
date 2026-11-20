from __future__ import annotations

import dataclasses
import datetime as dt
import enum
import math
import uuid
from decimal import Decimal
from pathlib import PurePosixPath

import pytest

from qualify import values
from qualify.jsontext import EVIDENCE_SHAPE, Fields, Items, document, write


class Colour(enum.Enum):
    RED = "red"


@dataclasses.dataclass
class Point:
    x: int
    y: int


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, None),
        (True, True),
        (1, 1),
        (1.0, 1),
        (-0.0, 0),
        (0.5, 0.5),
        (2**53, 2**53),
        (2**53 + 1, "9007199254740993"),
        (-(2**60), "-1152921504606846976"),
        (1e300, str(int(1e300))),
        (math.nan, "NaN"),
        (math.inf, "Infinity"),
        (-math.inf, "-Infinity"),
        ("text", "text"),
        (b"\x01\x02", {"$bytes": "AQI="}),
        (bytearray(b"\x00"), {"$bytes": "AA=="}),
        (memoryview(b"ab"), {"$bytes": "YWI="}),
        (Colour.RED, "red"),
        (Decimal("100.50"), "100.50"),
        (Decimal("NaN"), "NaN"),
        (Decimal("-Infinity"), "-Infinity"),
        (uuid.UUID(int=1), "00000000-0000-0000-0000-000000000001"),
        (PurePosixPath("a/b"), "a/b"),
        (Point(1, 2), {"x": 1, "y": 2}),
        ((1, "a"), [1, "a"]),
        ({3, 1, 2}, [1, 2, 3]),
        (frozenset({"b", "a"}), ["a", "b"]),
        ({1, "a"}, ["a", 1]),  # mixed types sort by their compact JSON text
        ({1: "a", None: "b"}, {"1": "a", "null": "b"}),
        (ValueError("x"), "[unserialisable: ValueError]"),
        (object(), "[unserialisable: object]"),
        (len, "[unserialisable: builtin_function_or_method]"),
    ],
)
def test_normalise(value: object, expected: object) -> None:
    assert values.normalise(value) == expected


def test_normalise_instants_in_utc_with_milliseconds() -> None:
    plus_two = dt.timezone(dt.timedelta(hours=2))
    assert (
        values.normalise(dt.datetime(2026, 1, 2, 5, 4, 5, 6999, tzinfo=plus_two))
        == "2026-01-02T03:04:05.006Z"
    )
    assert values.normalise(dt.datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02T03:04:05.000Z"
    assert values.normalise(dt.date(2026, 1, 2)) == "2026-01-02T00:00:00.000Z"


def test_a_cycle_makes_the_outer_value_unserialisable() -> None:
    inner: dict[str, object] = {}
    inner["self"] = inner
    assert values.normalise({"wrapper": [inner]}) == "[unserialisable: dict]"


def test_shared_values_that_are_not_cycles_are_kept() -> None:
    shared = [1]
    assert values.normalise([shared, shared]) == [[1], [1]]


def test_patterns_record_their_source() -> None:
    import re

    assert values.normalise(re.compile("a+")) == "a+"
    assert values.normalise(re.compile(b"a+")) == "[unserialisable: Pattern]"


def test_equal_compares_after_normalisation() -> None:
    assert values.equal(math.nan, math.nan)
    assert values.equal({"b": 1, "a": 2}, {"a": 2, "b": 1})
    assert values.equal(1, 1.0)
    assert not values.equal([1, 2], [2, 1])


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("a🚀b", 3),
        (b"ab", 2),
        ([1], 1),
        ({"a": 1}, 1),
        ({1, 2}, 2),
        (memoryview(b"abc"), 3),
        (5, None),
    ],
)
def test_length_of(value: object, expected: int | None) -> None:
    assert values.length_of(value) == expected


@pytest.mark.parametrize(
    ("number", "text"),
    [
        (0.0, "0"),
        (1.0, "1"),
        (-1.5, "-1.5"),
        (0.1, "0.1"),
        (1e-6, "0.000001"),
        (1.5e-7, "1.5e-7"),
        (123456.789, "123456.789"),
        (1e21, "1e+21"),
        (1.25e22, "1.25e+22"),
        (1e20, "100000000000000000000"),
        (math.inf, "null"),
        (42, "42"),
    ],
)
def test_number_text_matches_javascript(number: float, text: str) -> None:
    assert values.number_text(number) == text


def test_string_text_escapes_as_json_stringify() -> None:
    assert values.string_text('a"\\\n\t\x01é🚀') == '"a\\"\\\\\\n\\t\\u0001é🚀"'
    assert values.string_text("\ud800") == '"\\ud800"'


def test_key_text_is_compact_and_sorted() -> None:
    assert values.key_text({"b": [1, None, True], "a": {"d": False, "c": 0.5}}) == (
        '{"a":{"c":0.5,"d":false},"b":[1,null,true]}'
    )


def test_document_follows_the_shape_and_sorts_the_rest() -> None:
    shape = Fields(("z", "a"), {"z": Items(Fields(("y", "x")))})
    text = document({"a": 1, "z": [{"x": 1, "y": 2, "b": 3}], "m": {}, "e": []}, shape)
    assert text == (
        '{\n  "z": [\n    {\n      "y": 2,\n      "x": 1,\n      "b": 3\n    }\n  ],\n'
        '  "a": 1,\n  "e": [],\n  "m": {}\n}\n'
    )


def test_write_refuses_values_that_are_not_json() -> None:
    with pytest.raises(TypeError, match="cannot write object"):
        write(object())


def test_evidence_shape_puts_the_envelope_first() -> None:
    text = document({"tests": [], "kind": "run", "schemaVersion": 1}, EVIDENCE_SHAPE)
    assert text.index("schemaVersion") < text.index("kind") < text.index("tests")
