"""Normalisation, comparison and JSON text of recorded values (specification 7.1 and 6.3).

Every value recorded as ``expected`` or ``actual`` is normalised the same way in
every language, so the shared expected files match. The JSON text is written
the way the TypeScript reference writes it: numbers as JavaScript prints them,
and strings escaped as ``JSON.stringify`` escapes them.
"""

from __future__ import annotations

import base64
import dataclasses
import datetime as dt
import enum
import math
import re
import uuid
from collections.abc import Mapping, Sequence, Set
from decimal import Decimal
from pathlib import PurePath
from typing import TypeAlias

Json: TypeAlias = bool | int | float | str | list["Json"] | dict[str, "Json"] | None
"""A JSON value after normalisation: what the evidence files hold."""

LIMIT = 2**53
"""Integers beyond plus or minus this are recorded as strings."""


class _CycleFoundError(Exception):
    """Raised inside normalisation when a value refers back to itself."""


def _unserialisable(value: object) -> str:
    return f"[unserialisable: {type(value).__name__}]"


def timestamp(value: dt.datetime) -> str:
    """An instant as the schema's timestamp: UTC, milliseconds, ``Z``.

    A naive ``datetime`` is taken to be UTC already, so the record does not
    depend on the time zone of the machine that ran the test.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    utc = value.astimezone(dt.timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{utc.microsecond // 1000:03d}Z"


def _number(value: float) -> Json:
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    if value.is_integer():
        whole = int(value)
        return whole if abs(whole) <= LIMIT else str(whole)
    return value


def _integer(value: int) -> Json:
    return value if abs(value) <= LIMIT else str(value)


def _walk(value: object, seen: set[int]) -> Json:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, enum.Enum):
        return _walk(value.value, seen)
    if isinstance(value, int):
        return _integer(value)
    if isinstance(value, float):
        return _number(value)
    if isinstance(value, str):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"$bytes": base64.b64encode(bytes(value)).decode("ascii")}
    if isinstance(value, dt.datetime):
        return timestamp(value)
    if isinstance(value, dt.date):
        return timestamp(dt.datetime(value.year, value.month, value.day, tzinfo=dt.timezone.utc))
    if isinstance(value, Decimal):
        if value.is_nan():
            return "NaN"
        if value.is_infinite():
            return "Infinity" if value > 0 else "-Infinity"
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, PurePath):
        return value.as_posix()
    if isinstance(value, re.Pattern):
        return value.pattern if isinstance(value.pattern, str) else _unserialisable(value)
    if isinstance(value, BaseException):
        return _unserialisable(value)
    return _container(value, seen)


def _container(value: object, seen: set[int]) -> Json:
    is_dataclass = dataclasses.is_dataclass(value) and not isinstance(value, type)
    if not (isinstance(value, (Mapping, Set, Sequence)) or is_dataclass):
        return _unserialisable(value)
    marker = id(value)
    if marker in seen:
        raise _CycleFoundError
    seen.add(marker)
    try:
        if isinstance(value, Mapping):
            result: dict[str, Json] = {}
            for key, item in value.items():
                name = key if isinstance(key, str) else key_text(_walk(key, seen))
                result[name] = _walk(item, seen)
            return result
        if isinstance(value, Set):
            return sort_values([_walk(item, seen) for item in value])
        if isinstance(value, Sequence):
            return [_walk(item, seen) for item in value]
        return {
            field.name: _walk(getattr(value, field.name), seen)
            for field in dataclasses.fields(value)  # type: ignore[arg-type]
        }
    finally:
        seen.discard(marker)


def normalise(value: object) -> Json:
    """Normalise a value for the evidence, as specification section 7.1 defines it.

    Keys are sorted when written. Bytes become ``{"$bytes": base64}``, instants
    UTC timestamps, integers beyond 2^53 and non-finite numbers strings. A value
    that holds a cycle anywhere becomes one ``[unserialisable: <type>]`` string,
    named after the outer value's type. Python types with no JSON counterpart
    follow the nearest rule: ``Decimal``, ``UUID`` and paths become strings, an
    ``Enum`` its value, a dataclass a map of its fields, and any other object
    ``[unserialisable: <type>]``.
    """
    try:
        return _walk(value, set())
    except _CycleFoundError:
        return _unserialisable(value)


def equal(a: object, b: object) -> bool:
    """Deep equality after normalisation, so ``NaN`` equals itself here."""
    return key_text(normalise(a)) == key_text(normalise(b))


def length_of(value: object) -> int | None:
    """The length of a string (code points), list, set, map or bytes, else ``None``."""
    if isinstance(value, (str, bytes, bytearray, Mapping, Set, list, tuple)):
        return len(value)
    if isinstance(value, memoryview):
        return value.nbytes
    return None


def sort_values(values: list[Json]) -> list[Json]:
    """Sort normalised set members: numbers numerically, strings by code point, else by text."""
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        return sorted(values, key=lambda v: v)  # type: ignore[arg-type,return-value]
    if all(isinstance(v, str) for v in values):
        return sorted(values, key=lambda v: v)  # type: ignore[arg-type,return-value]
    return sorted(values, key=key_text)


_ESCAPE = re.compile(r'[\x00-\x1f"\\\ud800-\udfff]')
_SHORT = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}


def string_text(value: str) -> str:
    """A string as ``JSON.stringify`` writes it: other characters stay as they are."""
    return '"' + _ESCAPE.sub(lambda m: _SHORT.get(m[0], f"\\u{ord(m[0]):04x}"), value) + '"'


def number_text(value: int | float) -> str:
    """A number as JavaScript prints it, so ``1.0`` is ``1`` and ``1e-07`` is ``1e-7``."""
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        return "null"
    if value == 0:
        return "0"
    sign, digits, exponent = Decimal(repr(value)).as_tuple()
    text = "".join(map(str, digits)).rstrip("0") or "0"
    k = len(text)
    n = len(digits) + int(exponent)
    prefix = "-" if sign else ""
    if k <= n <= 21:
        return prefix + text + "0" * (n - k)
    if 0 < n <= 21:
        return prefix + text[:n] + "." + text[n:]
    if -6 < n <= 0:
        return prefix + "0." + "0" * -n + text
    mantissa = text if k == 1 else text[0] + "." + text[1:]
    power = n - 1
    return f"{prefix}{mantissa}e{'+' if power > 0 else '-'}{abs(power)}"


def key_text(value: Json) -> str:
    """Compact JSON with keys sorted by code point. Two values are deep-equal
    exactly when their texts are equal."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return number_text(value)
    if isinstance(value, str):
        return string_text(value)
    if isinstance(value, list):
        return "[" + ",".join(key_text(item) for item in value) + "]"
    return "{" + ",".join(f"{string_text(k)}:{key_text(value[k])}" for k in sorted(value)) + "}"
