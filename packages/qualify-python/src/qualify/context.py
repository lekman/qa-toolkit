"""The context a qualification test receives, its checks and matchers (specification section 3)."""

from __future__ import annotations

import datetime as dt
import inspect
import json
import re
from collections.abc import Callable, Mapping, Sequence, Set
from dataclasses import dataclass, field
from typing import Any, NoReturn, TypeVar

import pytest

from qualify import redaction
from qualify.jsontext import document
from qualify.site import caller
from qualify.values import Json, equal, length_of, normalise, timestamp

T = TypeVar("T")

_SECRET_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_JSON_TYPE = re.compile(r"^application/json\s*(;|$)", re.IGNORECASE)


class CheckFailed(Exception):
    """A failed check: raised by a hard check at once, and at the end of the
    body when any soft check failed. The outcome is ``fail``."""

    def __init__(self, message: str, site: str | None) -> None:
        super().__init__(message)
        self.message = message
        self.site = site


class AttachmentTooLarge(Exception):
    """An attachment over the size limit. The outcome is ``error``."""


class SecretNotFound(Exception):
    """``ctx.secret(name)`` found no value for the name. The outcome is ``error``."""


class Secret(str):
    """A string whose ``repr()`` hides its value, and which registers the value
    for redaction when it is created.

    It behaves as the plain string everywhere else, so ``"Bearer " + secret``
    is an ordinary string that holds the value, and the evidence redacts it.
    """

    __slots__ = ()

    def __new__(cls, value: str) -> Secret:
        instance = super().__new__(cls, value)
        redaction.register(str(instance), "qualify.Secret")
        return instance

    def __repr__(self) -> str:
        return "Secret('[REDACTED]')"


@dataclass
class Attachment:
    """An attachment as the test gave it, not yet redacted."""

    filename: str
    content_type: str
    data: bytes | None = None
    value: Json = None

    @property
    def is_json(self) -> bool:
        """Whether the attachment is held as a parsed JSON value."""
        return self.data is None


@dataclass
class CheckRecord:
    """One recorded check, before redaction."""

    seq: int
    context: str
    description: str
    matcher: str
    expected: Json
    actual: Json
    passed: bool
    soft: bool
    site: str
    at: str
    delegate: str | None = None

    def to_json(self) -> dict[str, object]:
        """The check as the evidence files hold it."""
        result: dict[str, object] = {
            "seq": self.seq,
            "context": self.context,
            "description": self.description,
            "matcher": self.matcher,
            "expected": self.expected,
            "actual": self.actual,
            "pass": self.passed,
            "soft": self.soft,
            "site": self.site,
            "at": self.at,
        }
        if self.delegate is not None:
            result["delegate"] = self.delegate
        return result


def _non_empty(value: object, what: str) -> str:
    if not isinstance(value, str) or value == "":
        raise TypeError(f"{what} must be a non-empty string")
    return value


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value


def _qualified_name(fn: Callable[..., object]) -> str:
    name = getattr(fn, "__qualname__", None) or getattr(fn, "__name__", None)
    return name if isinstance(name, str) and name else type(fn).__qualname__


@dataclass(frozen=True)
class MatchResult:
    """What a matcher records."""

    expected: Json
    actual: Json
    passed: bool


def evaluate(matcher: str, actual: object, argument: object = None) -> MatchResult:
    """Evaluate one matcher of specification section 3.2. Bad arguments raise ``TypeError``."""
    value = normalise(actual)
    if matcher in ("atLeast", "atMost"):
        if not _is_number(argument):
            raise TypeError(f"{matcher}() takes a number")
        passed = _is_number(actual) and (
            actual >= argument if matcher == "atLeast" else actual <= argument  # type: ignore[operator]
        )
        return MatchResult(normalise(argument), value, passed)
    if matcher == "contains":
        if isinstance(actual, str) and isinstance(argument, str):
            passed = argument in actual
        elif isinstance(actual, (Sequence, Set)) and not isinstance(actual, (str, bytes)):
            passed = any(equal(item, argument) for item in actual)
        else:
            passed = False
        return MatchResult(normalise(argument), value, passed)
    if matcher in ("equals", "notEquals"):
        same = equal(actual, argument)
        return MatchResult(normalise(argument), value, same if matcher == "equals" else not same)
    if matcher == "hasLength":
        if not isinstance(argument, int) or isinstance(argument, bool) or argument < 0:
            raise TypeError("has_length() takes a non-negative integer")
        length = length_of(actual)
        return MatchResult(argument, length, length == argument)
    if matcher == "isTrue":
        return MatchResult(True, value, actual is True)
    if matcher == "isFalse":
        return MatchResult(False, value, actual is False)
    if matcher == "isNull":
        return MatchResult(None, value, actual is None)
    if matcher == "isNotNull":
        return MatchResult("not null", value, actual is not None)
    if matcher == "matches":
        if isinstance(argument, re.Pattern):
            pattern: re.Pattern[str] = argument
        elif isinstance(argument, str):
            pattern = re.compile(argument)
        else:
            raise TypeError("matches() takes a regular expression or a string")
        passed = isinstance(actual, str) and pattern.search(actual) is not None
        return MatchResult(pattern.pattern, value, passed)
    if matcher == "oneOf":
        if not isinstance(argument, (list, tuple)):
            raise TypeError("one_of() takes a list of values")
        return MatchResult(normalise(argument), value, any(equal(actual, v) for v in argument))
    raise ValueError(f"unknown matcher {matcher}")


class Assertion:
    """The matchers for one value under test. Each records a check and returns
    whether it passed; a failed hard check raises :class:`CheckFailed`."""

    def __init__(self, ctx: Context, context: str, description: str, soft: bool, actual: object):
        self._ctx = ctx
        self._context = context
        self._description = description
        self._soft = soft
        self._actual = actual

    def _run(self, matcher: str, argument: object = None) -> bool:
        __tracebackhide__ = True
        return self._ctx._record(
            self._context, self._description, self._soft, matcher, self._actual, argument
        )

    def equals(self, expected: object) -> bool:
        """Deep equality after normalisation."""
        __tracebackhide__ = True
        return self._run("equals", expected)

    def not_equals(self, expected: object) -> bool:
        """Not deep-equal after normalisation."""
        __tracebackhide__ = True
        return self._run("notEquals", expected)

    def contains(self, expected: object) -> bool:
        """A string holds a substring, or a list or set holds an equal element."""
        __tracebackhide__ = True
        return self._run("contains", expected)

    def matches(self, pattern: str | re.Pattern[str]) -> bool:
        """A string matches a regular expression anywhere (``re.search``)."""
        __tracebackhide__ = True
        return self._run("matches", pattern)

    def is_true(self) -> bool:
        """The value is ``True``."""
        __tracebackhide__ = True
        return self._run("isTrue")

    def is_false(self) -> bool:
        """The value is ``False``."""
        __tracebackhide__ = True
        return self._run("isFalse")

    def is_null(self) -> bool:
        """The value is ``None``."""
        __tracebackhide__ = True
        return self._run("isNull")

    def is_not_null(self) -> bool:
        """The value is not ``None``."""
        __tracebackhide__ = True
        return self._run("isNotNull")

    def has_length(self, length: int) -> bool:
        """A string (in code points), list, set, map or bytes has this length."""
        __tracebackhide__ = True
        return self._run("hasLength", length)

    def at_least(self, bound: float) -> bool:
        """A number is at least the bound."""
        __tracebackhide__ = True
        return self._run("atLeast", bound)

    def at_most(self, bound: float) -> bool:
        """A number is at most the bound."""
        __tracebackhide__ = True
        return self._run("atMost", bound)

    def one_of(self, values: Sequence[object]) -> bool:
        """The value equals one of the values."""
        __tracebackhide__ = True
        return self._run("oneOf", values)


class Check:
    """A started check: make it soft, then give the value under test."""

    def __init__(self, ctx: Context, context: str, description: str, soft: bool = False):
        self._ctx = ctx
        self._context = context
        self._description = description
        self._soft = soft

    def soft(self) -> Check:
        """A soft check: records a failure and lets the test continue; the test fails at the end."""
        return Check(self._ctx, self._context, self._description, True)

    def that(self, actual: object) -> Assertion:
        """The value under test."""
        return Assertion(self._ctx, self._context, self._description, self._soft, actual)


@dataclass
class ContextSettings:
    """What a context needs from the run."""

    environment: str
    attachment_limit: int
    root: str
    read_secret: Callable[[str], str | None]
    run_context: Mapping[str, object]
    now: Callable[[], dt.datetime] = field(default=lambda: dt.datetime.now(dt.timezone.utc))


class Context:
    """The context a qualification test receives as its ``ctx`` fixture.

    It records checks and attachments in memory; the plugin redacts and writes
    them when the test ends.
    """

    def __init__(self, test_id: str, level: str, settings: ContextSettings) -> None:
        self.id = test_id
        """The test ID."""
        self.level = level
        """The test level: IQ, OQ, PQ or IU."""
        self.environment = settings.environment
        """The environment the test runs in."""
        self._settings = settings
        self._checks: list[CheckRecord] = []
        self._attachments: list[Attachment] = []
        self._secrets: set[str] = set()
        self._seq = 0

    def __repr__(self) -> str:
        return f"<qualify.Context {self.id} in {self.environment}>"

    # Recording -----------------------------------------------------------

    def _next(self) -> int:
        seq = self._seq
        self._seq += 1
        return seq

    def _site(self) -> str:
        return caller(self._settings.root) or "unknown:0"

    def _at(self) -> str:
        return timestamp(self._settings.now())

    def _record(
        self,
        context: str,
        description: str,
        soft: bool,
        matcher: str,
        actual: object,
        argument: object,
    ) -> bool:
        __tracebackhide__ = True
        seq = self._next()
        site = self._site()
        result = evaluate(matcher, actual, argument)
        self._checks.append(
            CheckRecord(
                seq,
                context,
                description,
                matcher,
                result.expected,
                result.actual,
                result.passed,
                soft,
                site,
                self._at(),
            )
        )
        if not result.passed and not soft:
            raise CheckFailed(f"{context}: {description}", site)
        return result.passed

    @property
    def checks(self) -> list[CheckRecord]:
        """Checks recorded so far, in call order."""
        return list(self._checks)

    @property
    def attachments(self) -> list[Attachment]:
        """Attachments added so far, not yet redacted."""
        return list(self._attachments)

    @property
    def secrets_used(self) -> list[str]:
        """Names of secrets read, sorted."""
        return sorted(self._secrets)

    def soft_failures(self) -> list[CheckRecord]:
        """Failed soft checks, in call order."""
        return [c for c in self._checks if c.soft and not c.passed]

    # The public surface --------------------------------------------------

    def check(self, context: str, description: str) -> Check:
        """Start a hard check: ``ctx.check(context, description).that(value).equals(x)``."""
        return Check(
            self, _non_empty(context, "check context"), _non_empty(description, "check description")
        )

    def delegate(self, context: str, description: str, fn: Callable[[], T]) -> T:
        """Run ``fn``, which has its own assertions, and record it as one check.

        The check records ``"completed"``, or the failure's message; the failure
        itself is raised again and keeps its own type.
        """
        _non_empty(context, "delegate context")
        _non_empty(description, "delegate description")
        if not callable(fn):
            raise TypeError("delegate() takes a function to run")
        if inspect.iscoroutinefunction(fn):
            raise TypeError(
                "delegate() runs a synchronous function; await async work in the test "
                "and check its result instead"
            )
        seq = self._next()
        site = self._site()

        def finish(actual: str, passed: bool) -> None:
            self._checks.append(
                CheckRecord(
                    seq,
                    context,
                    description,
                    "delegate",
                    "completes",
                    actual,
                    passed,
                    False,
                    site,
                    self._at(),
                    _qualified_name(fn),
                )
            )

        try:
            result = fn()
        except BaseException as error:
            finish(str(error), False)
            raise
        finish("completed", True)
        return result

    def attach(self, filename: str, body: object, content_type: str) -> None:
        """Add an inline attachment.

        ``body`` is text, bytes, or, for ``application/json``, any value or
        JSON text. An attachment over the size limit ends the test with
        :class:`AttachmentTooLarge`; it is never truncated.
        """
        _non_empty(filename, "attachment filename")
        if "/" in filename or "\\" in filename:
            raise TypeError(f"attachment filename {filename} must not contain / or \\")
        _non_empty(content_type, "attachment content type")
        pending = _attachment(filename, body, content_type)
        size = (
            len(pending.data)
            if pending.data is not None
            else len(document(pending.value).encode("utf-8"))
        )
        limit = self._settings.attachment_limit
        if size > limit:
            raise AttachmentTooLarge(
                f"attachment {filename} is {size} bytes, over the limit of {limit} bytes"
            )
        self._attachments.append(pending)

    def secret(self, name: str) -> Secret:
        """Read a named secret (``QUALIFY_SECRET_<NAME>`` by default) and register it."""
        if not isinstance(name, str) or not _SECRET_NAME.match(name):
            raise TypeError(f"secret name {name!r} must be letters, digits and underscores")
        value = self._settings.read_secret(name)
        if not value:
            raise SecretNotFound(
                f"secret {name} is not set (the default source reads QUALIFY_SECRET_{name})"
            )
        self._secrets.add(name)
        return Secret(value)

    def redact(self, value: str) -> str:
        """Register a value for redaction and return it unchanged."""
        if not isinstance(value, str):
            raise TypeError("redact() takes a string")
        redaction.register(value, f"qualify: {self.id}")
        return value

    def skip(self, reason: str) -> NoReturn:
        """Skip the test at runtime, with a reason. pytest shows it as skipped."""
        pytest.skip(_non_empty(reason, "skip reason"))

    def run_context(self, extra: Mapping[str, object] | None = None) -> None:
        """Attach ``run-context.json``: the run's source, actor and target, and ``extra``."""
        run = self._settings.run_context
        body: dict[str, Any] = {
            "actor": run.get("actor"),
            "extra": {k: normalise(v) for k, v in (extra or {}).items()},
            "source": run.get("source"),
            "target": run.get("target"),
        }
        self.attach("run-context.json", body, "application/json")


def _reject_constant(name: str) -> object:
    raise ValueError(f"{name} is not JSON")


def _attachment(filename: str, body: object, content_type: str) -> Attachment:
    is_json = _JSON_TYPE.match(content_type.strip()) is not None
    if isinstance(body, (str, bytes, bytearray, memoryview)):
        data = body.encode("utf-8") if isinstance(body, str) else bytes(body)
        if is_json:
            try:
                parsed = json.loads(data.decode("utf-8"), parse_constant=_reject_constant)
            except ValueError:
                pass
            else:
                return Attachment(filename, content_type, value=normalise(parsed))
        return Attachment(filename, content_type, data=data)
    if not is_json:
        raise TypeError(
            f"attachment {filename}: only application/json takes a value body; pass text or bytes"
        )
    return Attachment(filename, content_type, value=normalise(body))
