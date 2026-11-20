"""Redaction, as specification section 7.2 defines it.

The functions are pure: the caller passes the registered values in. The
process-wide registry lives in :data:`registry`, which ``Secret``,
``ctx.secret`` and ``ctx.redact`` add to.
"""

from __future__ import annotations

import re
import threading
import warnings

from qualify.values import Json

REPLACEMENT = "[REDACTED]"
"""The text every redacted value is replaced with."""

MIN_LENGTH = 6
"""Values shorter than this are refused, because they would redact ordinary words."""

_PATTERNS = (
    # A PEM private key block, to the matching END line or, when the block is
    # cut short, to the end of the text.
    r"-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----"
    r"(?:[\s\S]*?-----END \1PRIVATE KEY-----|[\s\S]*\Z)",
    # A JWT shape: three base64url segments, the first starting with eyJ.
    r"eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
    # An access-key-ID shape.
    r"(?:AKIA|ASIA)[A-Z0-9]{16}",
)
_TEXT_PATTERNS = tuple(re.compile(p) for p in _PATTERNS)
_BYTE_PATTERNS = tuple(re.compile(p.encode("ascii")) for p in _PATTERNS)
_SENSITIVE_KEYS = frozenset(
    {"api_key", "apikey", "authorization", "passwd", "password", "privatekey", "secret", "token"}
)


class RedactionWarning(UserWarning):
    """A value was too short to register for redaction."""


class SecretRegistry:
    """Registered secret values, refusing values too short to redact safely."""

    def __init__(self) -> None:
        self._values: dict[str, None] = {}
        self._lock = threading.Lock()

    def add(self, value: str) -> bool:
        """Register a value. Returns ``False`` when it is too short to register."""
        if len(value) < MIN_LENGTH:
            return False
        with self._lock:
            self._values[str(value)] = None
        return True

    def values(self) -> tuple[str, ...]:
        """Every registered value, in registration order."""
        with self._lock:
            return tuple(self._values)

    def clear(self) -> None:
        """Forget every registered value. For tests of qualify itself."""
        with self._lock:
            self._values.clear()


registry = SecretRegistry()
"""The process-wide registry. A value registered in one test is redacted in every later record."""


def register(value: str, where: str = "qualify") -> None:
    """Register a value in the process-wide registry, warning when it is refused."""
    if not registry.add(value):
        warnings.warn(
            f"{where}: a value shorter than {MIN_LENGTH} characters was not registered "
            "for redaction, because it would redact ordinary words",
            RedactionWarning,
            stacklevel=3,
        )


def _longest_first(values: tuple[str, ...] | list[str]) -> list[str]:
    return sorted(dict.fromkeys(values), key=len, reverse=True)


def patterns(text: str) -> str:
    """Apply the pattern rules only."""
    for pattern in _TEXT_PATTERNS:
        text = pattern.sub(REPLACEMENT, text)
    return text


def text(value: str, registered: tuple[str, ...] | list[str] = ()) -> str:
    """Redact one string: registered values first, longest first, then the patterns."""
    for secret in _longest_first(registered):
        value = value.replace(secret, REPLACEMENT)
    return patterns(value)


def data(value: bytes, registered: tuple[str, ...] | list[str] = ()) -> bytes:
    """Redact bytes without decoding them, so the bytes around a match never change.

    Registered values match as their UTF-8 bytes, the pattern rules as ASCII.
    """
    replacement = REPLACEMENT.encode("ascii")
    for secret in _longest_first(registered):
        value = value.replace(secret.encode("utf-8"), replacement)
    for pattern in _BYTE_PATTERNS:
        value = pattern.sub(replacement, value)
    return value


def value(item: Json, registered: tuple[str, ...] | list[str] = ()) -> Json:
    """Redact every string and key inside a JSON value."""
    if isinstance(item, str):
        return text(item, registered)
    if isinstance(item, list):
        return [value(i, registered) for i in item]
    if isinstance(item, dict):
        return {text(k, registered): value(v, registered) for k, v in item.items()}
    return item


def document(item: Json, registered: tuple[str, ...] | list[str] = ()) -> Json:
    """Redact a JSON attachment: values under sensitive keys, compared without
    case, become ``[REDACTED]`` whole; every other string and key is redacted as text."""
    if isinstance(item, list):
        return [document(i, registered) for i in item]
    if isinstance(item, dict):
        return {
            text(k, registered): (
                REPLACEMENT if k.lower() in _SENSITIVE_KEYS else document(v, registered)
            )
            for k, v in item.items()
        }
    return value(item, registered)
