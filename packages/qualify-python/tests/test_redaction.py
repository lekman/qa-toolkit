from __future__ import annotations

import pytest

from qualify import redaction
from qualify.values import Json

# Joined from two parts so secret scanners do not flag this file.
ACCESS_KEY = "AK" + "IAABCDEFGHIJKLMNOP"
JWT = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl"
PEM = "-----BEGIN RSA PRIVATE" + " KEY-----\nabc\n-----END RSA PRIVATE KEY-----"


def test_registered_values_are_replaced_longest_first() -> None:
    assert redaction.text("token-abc and token-abcdef", ["token-abc", "token-abcdef"]) == (
        "[REDACTED] and [REDACTED]"
    )


def test_pattern_rules_apply_without_registration() -> None:
    assert redaction.text(f"{PEM} {JWT} {ACCESS_KEY}") == "[REDACTED] [REDACTED] [REDACTED]"


def test_a_cut_pem_block_is_redacted_to_the_end() -> None:
    cut = "head -----BEGIN PRIVATE" + " KEY-----\nabc\nmore"
    assert redaction.text(cut) == "head [REDACTED]"


def test_bytes_keep_the_bytes_around_a_match() -> None:
    data = b"\x00\xff" + b"secret-value" + b"\x80" + ACCESS_KEY.encode()
    assert redaction.data(data, ["secret-value"]) == b"\x00\xff[REDACTED]\x80[REDACTED]"


def test_json_documents_redact_sensitive_keys_whole() -> None:
    doc: Json = {
        "Password": {"a": 1},
        "apiKey": "x",
        "note": "has secret-value",
        "list": [{"TOKEN": 1}],
    }
    assert redaction.document(doc, ["secret-value"]) == {
        "Password": "[REDACTED]",
        "apiKey": "[REDACTED]",
        "note": "has [REDACTED]",
        "list": [{"TOKEN": "[REDACTED]"}],
    }


def test_value_redacts_keys_and_strings_and_keeps_other_values() -> None:
    assert redaction.value({"secret-value": ["secret-value", 1, None]}, ["secret-value"]) == {
        "[REDACTED]": ["[REDACTED]", 1, None]
    }


def test_the_registry_refuses_short_values_with_a_warning() -> None:
    with pytest.warns(redaction.RedactionWarning, match="shorter than 6"):
        redaction.register("abc")
    redaction.register("abcdef")
    assert redaction.registry.values() == ("abcdef",)
