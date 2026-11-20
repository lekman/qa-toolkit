"""Writes one test's evidence: the started marker, then the redacted record."""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import os
from collections.abc import Callable
from types import TracebackType

from qualify import redaction
from qualify.context import Attachment, CheckFailed, Context, ContextSettings
from qualify.declaration import Declaration
from qualify.evidence import marker_name, record_name, write_atomic
from qualify.jsontext import EVIDENCE_SHAPE, document
from qualify.outcome import Classification, classify
from qualify.runtime import Process
from qualify.site import in_file
from qualify.values import Json, timestamp


def _now() -> dt.datetime:
    now = dt.datetime.now(dt.timezone.utc)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def finalise_attachment(pending: Attachment, registered: tuple[str, ...]) -> dict[str, object]:
    """Redact and encode one attachment.

    A JSON attachment is redacted as JSON, then written like an evidence file.
    Any other attachment is redacted as bytes.
    """
    if pending.data is None:
        data = document(redaction.document(pending.value, registered)).encode("utf-8")
    else:
        data = redaction.data(pending.data, registered)
    return {
        "filename": redaction.text(pending.filename, registered),
        "contentType": pending.content_type,
        "encoding": "base64",
        "content": base64.b64encode(data).decode("ascii"),
        "sizeBytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


class Recorder:
    """The evidence of one qualification test in one process."""

    def __init__(
        self,
        declaration: Declaration,
        process: Process,
        test_file: str,
        clock: Callable[[], dt.datetime] = _now,
    ) -> None:
        self.declaration = declaration
        self.process = process
        self.test_file = test_file
        self._clock = clock
        self.started: dt.datetime | None = None
        self.finished = False
        settings = process.settings
        self.context = Context(
            declaration.id,
            declaration.level,
            ContextSettings(
                environment=settings.environment,
                attachment_limit=settings.attachment_limit,
                root=process.root,
                read_secret=settings.read_secret,
                run_context=process.envelope,
                now=clock,
            ),
        )

    @property
    def run_id(self) -> str:
        """The run this test belongs to."""
        return str(self.process.envelope["id"])

    def _path(self, name: str) -> str:
        return os.path.join(self.process.records_dir, name)

    def start(self) -> None:
        """Write the started marker. A marker without a record means the test did not finish."""
        self.started = self._clock()
        test = redaction.value(
            self.declaration.to_json(),  # type: ignore[arg-type]
            redaction.registry.values(),
        )
        assert isinstance(test, dict)
        test["startedAt"] = timestamp(self.started)
        marker = {"schemaVersion": 1, "kind": "started", "run": self.process.envelope, "test": test}
        write_atomic(
            self._path(marker_name(self.run_id, self.declaration.id, self.declaration.site)),
            document(marker, EVIDENCE_SHAPE),
        )

    def policy_skip(self) -> str | None:
        """The policy or "not applicable" reason to skip this test before it runs."""
        return self.process.settings.skip_reason(self.declaration)

    def finish(
        self,
        error: BaseException | None,
        traceback: TracebackType | None = None,
        skip_reason: str | None = None,
    ) -> Classification:
        """Classify the end of the test and write its redacted record."""
        if self.started is None:
            self.start()
        assert self.started is not None
        ended = self._clock()
        classification = (
            Classification("skip", skip_reason=skip_reason)
            if skip_reason is not None
            else classify(error)
        )
        registered = redaction.registry.values()
        test: dict[str, object] = self.declaration.to_json()
        test["outcome"] = classification.outcome
        if classification.skip_reason is not None:
            test["skipReason"] = classification.skip_reason
        if classification.failure_type is not None:
            test["error"] = {
                "type": classification.failure_type,
                "message": classification.message or "",
                "site": self._failure_site(error, traceback),
            }
        test["startedAt"] = timestamp(self.started)
        test["endedAt"] = timestamp(ended)
        test["durationMs"] = max(0, round((ended - self.started).total_seconds() * 1000))
        test["checks"] = [c.to_json() for c in self.context.checks]
        test["secretsUsed"] = self.context.secrets_used
        redacted = redaction.value(test, registered)  # type: ignore[arg-type]
        assert isinstance(redacted, dict)
        attachments: list[Json] = [
            finalise_attachment(a, registered)  # type: ignore[misc]
            for a in self.context.attachments
        ]
        redacted["attachments"] = attachments
        record = {
            "schemaVersion": 1,
            "kind": "record",
            "run": self.process.envelope,
            "test": redacted,
        }
        write_atomic(
            self._path(record_name(self.run_id, self.declaration.id, self.declaration.site)),
            document(record, EVIDENCE_SHAPE),
        )
        self.finished = True
        return classification

    def _failure_site(
        self, error: BaseException | None, traceback: TracebackType | None
    ) -> str | None:
        if isinstance(error, CheckFailed):
            return error.site
        if error is None:
            return None
        return in_file(traceback or error.__traceback__, self.test_file, self.process.root)
