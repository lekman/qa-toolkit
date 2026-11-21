from __future__ import annotations

import base64
import datetime as dt
import json
import math
import re

import pytest

from qualify import redaction
from qualify.context import (
    AttachmentTooLarge,
    CheckFailed,
    Context,
    ContextSettings,
    Secret,
    SecretNotFound,
    evaluate,
)
from qualify.recorder import finalise_attachment

NOW = dt.datetime(2026, 1, 2, 3, 4, 5, tzinfo=dt.timezone.utc)


def make(limit: int = 1024, secrets: dict[str, str] | None = None) -> Context:
    return Context(
        "OQ-AREA-001",
        "OQ",
        ContextSettings(
            environment="local",
            attachment_limit=limit,
            root="/",
            read_secret=(secrets or {}).get,
            run_context={"actor": {"name": "a"}, "source": {"commit": None}, "target": {}},
            now=lambda: NOW,
        ),
    )


@pytest.mark.parametrize(
    ("matcher", "actual", "argument", "expected", "recorded", "passed"),
    [
        ("equals", {"b": [1]}, {"b": [1]}, {"b": [1]}, {"b": [1]}, True),
        ("notEquals", 1, 2, 2, 1, True),
        ("contains", "qualify", "ali", "ali", "qualify", True),
        ("contains", [1, {"a": 2}], {"a": 2}, {"a": 2}, [1, {"a": 2}], True),
        ("contains", {"x"}, "x", "x", ["x"], True),
        ("contains", 5, 5, 5, 5, False),
        ("matches", "abc", "b.", "b.", "abc", True),
        ("matches", "abc", re.compile("^b"), "^b", "abc", False),
        ("matches", 5, "5", "5", 5, False),
        ("isTrue", 1, None, True, 1, False),
        ("isFalse", False, None, False, False, True),
        ("isNull", None, None, None, None, True),
        ("isNotNull", 0, None, "not null", 0, True),
        ("hasLength", "a🚀", 2, 2, 2, True),
        ("hasLength", 5, 1, 1, None, False),
        ("atLeast", 3, 3, 3, 3, True),
        ("atLeast", math.nan, 1, 1, "NaN", False),
        ("atMost", 2.5, 2, 2, 2.5, False),
        ("atMost", "1", 2, 2, "1", False),
        ("oneOf", 2, [1, 2], [1, 2], 2, True),
    ],
)
def test_matchers(
    matcher: str, actual: object, argument: object, expected: object, recorded: object, passed: bool
) -> None:
    result = evaluate(matcher, actual, argument)
    assert (result.expected, result.actual, result.passed) == (expected, recorded, passed)


@pytest.mark.parametrize(
    ("matcher", "argument", "message"),
    [
        ("atLeast", "1", "takes a number"),
        ("hasLength", -1, "non-negative integer"),
        ("hasLength", True, "non-negative integer"),
        ("matches", 5, "regular expression"),
        ("oneOf", 5, "list of values"),
    ],
)
def test_bad_matcher_arguments(matcher: str, argument: object, message: str) -> None:
    with pytest.raises(TypeError, match=message):
        evaluate(matcher, 1, argument)


def test_unknown_matcher() -> None:
    with pytest.raises(ValueError, match="unknown matcher"):
        evaluate("nope", 1)


def test_checks_record_in_order_and_a_hard_failure_raises() -> None:
    ctx = make()
    assert ctx.check("c", "one").that(1).equals(1)
    assert not ctx.check("c", "soft").soft().that(1).not_equals(1)
    assert ctx.check("c", "list").that([1, 2]).contains(2)
    assert ctx.check("c", "re").that("ab").matches("a")
    assert ctx.check("c", "t").that(True).is_true()
    assert ctx.check("c", "f").that(False).is_false()
    assert ctx.check("c", "n").that(None).is_null()
    assert ctx.check("c", "nn").that(0).is_not_null()
    assert ctx.check("c", "len").that("ab").has_length(2)
    assert ctx.check("c", "min").that(2).at_least(1)
    assert ctx.check("c", "max").that(1).at_most(2)
    assert ctx.check("c", "one of").that("b").one_of(["a", "b"])
    with pytest.raises(CheckFailed) as raised:
        ctx.check("bank file", "EUR keeps two decimals").that("100.5").equals("100.50")
    assert raised.value.message == "bank file: EUR keeps two decimals"
    assert raised.value.site is not None
    assert raised.value.site.split(":")[0].endswith("tests/test_context.py")
    assert [c.seq for c in ctx.checks] == list(range(13))
    assert [c.description for c in ctx.soft_failures()] == ["soft"]
    record = ctx.checks[0].to_json()
    assert record["at"] == "2026-01-02T03:04:05.000Z"
    assert "delegate" not in record
    assert "test_context.py" in str(record["site"])


def test_check_arguments_must_not_be_empty() -> None:
    with pytest.raises(TypeError, match="check context"):
        make().check("", "d")


def test_delegate_records_completion_and_failure() -> None:
    ctx = make()

    def helper() -> int:
        return 3

    def failing() -> None:
        raise AssertionError("helper failed")

    assert ctx.delegate("h", "works", helper) == 3
    with pytest.raises(AssertionError, match="helper failed"):
        ctx.delegate("h", "fails", failing)
    first, second = (c.to_json() for c in ctx.checks)
    assert (first["actual"], first["pass"], first["delegate"]) == (
        "completed",
        True,
        "test_delegate_records_completion_and_failure.<locals>.helper",
    )
    assert (second["expected"], second["actual"], second["pass"]) == (
        "completes",
        "helper failed",
        False,
    )


def test_delegate_refuses_coroutines_and_non_callables() -> None:
    async def work() -> None:
        pass

    ctx = make()
    with pytest.raises(TypeError, match="synchronous"):
        _ = ctx.delegate("h", "d", work)
    with pytest.raises(TypeError, match="takes a function"):
        ctx.delegate("h", "d", 3)  # type: ignore[arg-type]


def test_attachments() -> None:
    ctx = make(limit=64)
    ctx.attach("note.txt", "hello\n", "text/plain")
    ctx.attach("a.json", '{"b": 1.0, "a": [true]}', "application/json; charset=utf-8")
    ctx.attach("bad.json", "{nope", "application/json")
    ctx.attach("nan.json", "NaN", "application/json")
    ctx.attach("value.json", {"token": "x"}, "application/json")
    names = [(a.filename, a.is_json) for a in ctx.attachments]
    assert names == [
        ("note.txt", False),
        ("a.json", True),
        ("bad.json", False),
        ("nan.json", False),
        ("value.json", True),
    ]
    encoded = finalise_attachment(ctx.attachments[1], ())
    assert (
        base64.b64decode(str(encoded["content"])) == b'{\n  "a": [\n    true\n  ],\n  "b": 1\n}\n'
    )
    with pytest.raises(
        AttachmentTooLarge, match=r"big\.txt is 65 bytes, over the limit of 64 bytes"
    ):
        ctx.attach("big.txt", "a" * 65, "text/plain")
    with pytest.raises(TypeError, match="must not contain"):
        ctx.attach("a/b", "x", "text/plain")
    with pytest.raises(TypeError, match="only application/json"):
        ctx.attach("x.bin", {"a": 1}, "application/octet-stream")


def test_secrets_are_registered_and_hidden() -> None:
    ctx = make(secrets={"TOKEN": "s3cr3t-value"})
    token = ctx.secret("TOKEN")
    assert isinstance(token, Secret)
    assert token == "s3cr3t-value"
    assert "s3cr3t" not in repr(token)
    assert "Bearer " + token == "Bearer s3cr3t-value"
    assert ctx.secrets_used == ["TOKEN"]
    assert redaction.registry.values() == ("s3cr3t-value",)
    with pytest.raises(SecretNotFound, match="QUALIFY_SECRET_OTHER"):
        ctx.secret("OTHER")
    with pytest.raises(TypeError, match="letters, digits"):
        ctx.secret("bad-name")


def test_redact_registers_and_returns_the_value() -> None:
    ctx = make()
    assert ctx.redact("another-value") == "another-value"
    assert "another-value" in redaction.registry.values()
    with pytest.raises(TypeError, match="takes a string"):
        ctx.redact(5)  # type: ignore[arg-type]


def test_skip_raises_pytest_skip() -> None:
    with pytest.raises(pytest.skip.Exception, match="not seeded"):
        make().skip("not seeded")


def test_run_context_attaches_the_envelope() -> None:
    ctx = make()
    ctx.run_context({"build": 7, "when": NOW})
    attachment = finalise_attachment(ctx.attachments[0], ())
    assert attachment["filename"] == "run-context.json"
    assert json.loads(base64.b64decode(str(attachment["content"]))) == {
        "actor": {"name": "a"},
        "extra": {"build": 7, "when": "2026-01-02T03:04:05.000Z"},
        "source": {"commit": None},
        "target": {},
    }
    assert repr(ctx) == "<qualify.Context OQ-AREA-001 in local>"
