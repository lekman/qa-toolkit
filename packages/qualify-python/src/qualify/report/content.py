"""What the qualification report says (specification section 9.1): the cover, the
run details, the summary and traceability, a section per test, and the
signature block. Pure: the theme decides the texts, the layout comes later.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from qualify import theme as themes
from qualify.trace import Matrix
from qualify.values import Json, key_text

MISSING = "-"
LEVELS = ("IQ", "OQ", "PQ", "IU")
OUTCOMES = ("pass", "fail", "error", "skip")
_CUT = 200


def missing(value: str | None) -> str:
    """The value, or ``-`` when it is missing or empty."""
    return MISSING if value is None or value == "" else value


def listing(values: Sequence[str]) -> str:
    """A list joined with commas, or ``-`` when it is empty."""
    return ", ".join(values) if values else MISSING


def time_text(value: str | dt.datetime) -> str:
    """An instant as ``YYYY-MM-DD HH:MM:SS UTC``."""
    if isinstance(value, str):
        value = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def json_text(value: Json) -> str:
    """A value as compact JSON with sorted keys, cut after 200 code points."""
    text = key_text(value)
    if len(text) <= _CUT:
        return text
    return f"{text[:_CUT]}… ({len(text) - _CUT} more characters)"


def verdict_text(verdict: str) -> str:
    """The verdict in words."""
    return {"pass": "Passed", "fail": "Failed"}.get(verdict, "Incomplete")


def counts(summary: Mapping[str, Any]) -> str:
    """``<total> tests: <pass> pass, <fail> fail, <error> error, <skip> skip``"""
    return (
        f"{summary['total']} tests: {summary['pass']} pass, {summary['fail']} fail, "
        f"{summary['error']} error, {summary['skip']} skip"
    )


def levels_text(tests: Sequence[Mapping[str, Any]]) -> str:
    """The levels present, in IQ, OQ, PQ, IU order: ``IQ``, ``IQ and OQ``, ``IQ, OQ and PQ``."""
    present = [level for level in LEVELS if any(t["level"] == level for t in tests)]
    if not present:
        return MISSING
    if len(present) == 1:
        return present[0]
    return f"{', '.join(present[:-1])} and {present[-1]}"


def document_id(run: Mapping[str, Any]) -> str:
    """``QR-<environment>-<run start date as YYYYMMDD>``"""
    return f"QR-{run['run']['environment']}-{run['run']['startedAt'][:10].replace('-', '')}"


@dataclass(frozen=True)
class Column:
    """A table column: its header, its share of the text width, and whether it is mono."""

    header: str
    width: float
    mono: bool = False


@dataclass(frozen=True)
class Field:
    """One label and value of a field list."""

    label: str
    value: str
    mono: bool = False


@dataclass(frozen=True)
class Heading:
    level: Literal[1, 2, 3]
    text: str


@dataclass(frozen=True)
class Paragraph:
    text: str


@dataclass(frozen=True)
class Listing:
    items: tuple[str, ...]


@dataclass(frozen=True)
class Fields:
    fields: tuple[Field, ...]


@dataclass(frozen=True)
class Table:
    columns: tuple[Column, ...]
    rows: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class Signatures:
    roles: tuple[str, ...]


Block = Heading | Paragraph | Listing | Fields | Table | Signatures


@dataclass(frozen=True)
class Cover:
    """What the cover page shows."""

    brand_name: str | None
    title: str
    subtitle: str
    fields: tuple[Field, ...]


@dataclass(frozen=True)
class Options:
    """What the caller asked for. ``None`` takes the theme's value; ``signatures``
    is a tuple of roles, ``()`` for none, or ``None`` for the theme's."""

    generated_at: dt.datetime
    title: str | None = None
    subtitle: str | None = None
    document_id: str | None = None
    classification: str | None = None
    signatures: tuple[str, ...] | None = None


@dataclass(frozen=True)
class Metadata:
    title: str
    subject: str
    keywords: str
    producer: str
    creation_date: dt.datetime


@dataclass(frozen=True)
class Document:
    """Everything the renderer needs: cover, content, page texts and metadata."""

    cover: Cover
    blocks: tuple[Block, ...]
    classification: str
    header: str
    footer: str
    tokens: Mapping[str, str]
    metadata: Metadata = field(compare=False)


def tokens(
    run: Mapping[str, Any], digest: str, spec: Mapping[str, Any], options: Options
) -> dict[str, str]:
    """Token values for the theme's texts. The classification and title are
    resolved first, from flags or their templates, so the other texts can use them."""
    values = {
        "documentId": options.document_id or document_id(run),
        "environment": run["run"]["environment"],
        "levels": levels_text(run["tests"]),
        "date": options.generated_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%d"),
        "version": missing(run["run"]["target"].get("version")),
        "verdict": verdict_text(run["summary"]["verdict"]),
        "runId": run["run"]["id"],
        "sha12": digest[:12],
    }
    texts = spec["texts"]
    classification = (
        options.classification
        if options.classification is not None
        else themes.render(texts["classification"], values)
    )
    title = options.title if options.title is not None else themes.render(texts["title"], values)
    return {**values, "classification": classification, "title": title}


def _cover_fields(
    spec: Mapping[str, Any], values: Mapping[str, str], run: Mapping[str, Any]
) -> tuple[Field, ...]:
    commit = run["run"]["source"]["commit"]
    rows = {
        "documentId": Field("Document ID", values["documentId"]),
        "date": Field("Date", values["date"]),
        "verdict": Field("Verdict", values["verdict"]),
        "tests": Field("Tests", counts(run["summary"])),
        "environment": Field("Environment", values["environment"]),
        "version": Field("Version", values["version"]),
        "commit": Field("Commit", missing(commit[:12] if commit else None)),
        "classification": Field("Classification", values["classification"]),
    }
    return tuple(
        rows[name]
        for name in spec["cover"]["fields"]
        if name != "classification" or values["classification"]
    )


def _details(run: Mapping[str, Any], digest: str, options: Options) -> list[Block]:
    info = run["run"]
    overrides = [f"{o['id']}: {o['reason']}" for o in info["policy"]["overrides"]]
    return [
        Heading(2, "Run details"),
        Fields(
            (
                Field("Run ID", info["id"], mono=True),
                Field("Run start", time_text(info["startedAt"])),
                Field("Run end", time_text(info["endedAt"])),
                Field("Commit", missing(info["source"]["commit"]), mono=True),
                Field("Branch", missing(info["source"]["branch"])),
                Field("Tool", f"{info['tool']['name']} {info['tool']['version']}"),
                Field("Generated", time_text(options.generated_at)),
                Field("Run file SHA-256", digest, mono=True),
                Field("Merged runs", listing(info.get("mergedRuns", [])), mono=True),
                Field("Write overrides", listing(overrides)),
            )
        ),
    ]


def _items(items: Sequence[str]) -> Block:
    return Listing(tuple(items)) if items else Paragraph("None")


def _summary(run: Mapping[str, Any], matrix: Matrix) -> list[Block]:
    tests = run["tests"]

    def row(label: str, chosen: Sequence[Mapping[str, Any]]) -> tuple[str, ...]:
        return (
            label,
            str(len(chosen)),
            *(str(sum(t["outcome"] == o for t in chosen)) for o in OUTCOMES),
        )

    titles = {r.test_id: r.title for r in matrix.rows}
    return [
        Heading(2, "Summary"),
        Table(
            (
                Column("Level", 0.2),
                *(Column(name, 0.16) for name in ("Total", "Pass", "Fail", "Error", "Skip")),
            ),
            (
                *(row(level, [t for t in tests if t["level"] == level]) for level in LEVELS),
                row("All", tests),
            ),
        ),
        Heading(2, "Traceability"),
        Table(
            (
                Column("Requirement", 0.2),
                Column("Test ID", 0.19, mono=True),
                Column("Level", 0.08),
                Column("Title", 0.3),
                Column("Risk", 0.09),
                Column("Outcome", 0.14),
            ),
            tuple(
                (
                    MISSING
                    if r.requirement is None
                    else f"{r.requirement} ({', '.join(r.sources)})",
                    r.test_id,
                    r.level,
                    r.title,
                    missing(r.risk),
                    r.outcome,
                )
                for r in matrix.rows
            ),
        ),
        Heading(3, "Not run"),
        _items([f"{i} {titles.get(i, '')}".strip() for i in matrix.not_run]),
        Heading(3, "Requirements without a passing test"),
        _items(matrix.without_pass),
    ]


def _test(test: Mapping[str, Any]) -> list[Block]:
    fields = [
        Field("Level", test["level"]),
        Field("Outcome", test["outcome"]),
        Field("Risk", missing(test.get("risk"))),
        Field("Scope", test["scope"]),
        Field("Requirements", listing(test["requirements"])),
        Field("Tags", listing(test["tags"])),
        Field("Controls", missing(test.get("controls")), mono="controls" in test),
    ]
    if "skipReason" in test:
        fields.append(Field("Skip reason", test["skipReason"]))
    if "error" in test:
        fields += [
            Field("Error type", test["error"]["type"]),
            Field("Error message", test["error"]["message"]),
        ]
    fields += [
        Field("Given", test["given"]),
        Field("When", test["when"]),
        Field("Then", test["then"]),
        *(Field("And", clause) for clause in test.get("and", [])),
        Field("Started", time_text(test["startedAt"])),
        Field("Duration", f"{test['durationMs']} ms"),
        Field("Secrets used", listing(test["secretsUsed"])),
    ]
    checks: Block = (
        Table(
            (
                Column("#", 0.05),
                Column("Context", 0.13),
                Column("Description", 0.21),
                Column("Matcher", 0.11),
                Column("Expected", 0.18, mono=True),
                Column("Actual", 0.18, mono=True),
                Column("Result", 0.14),
            ),
            tuple(
                (
                    str(c["seq"] + 1),
                    c["context"],
                    c["description"],
                    c["matcher"],
                    json_text(c["expected"]),
                    json_text(c["actual"]),
                    ("Pass" if c["pass"] else "Fail") + (" (soft)" if c["soft"] else ""),
                )
                for c in test["checks"]
            ),
        )
        if test["checks"]
        else Paragraph("None")
    )
    attachments: Block = (
        Table(
            (
                Column("File", 0.2),
                Column("Content type", 0.2),
                Column("Size", 0.12),
                Column("SHA-256", 0.48, mono=True),
            ),
            tuple(
                (a["filename"], a["contentType"], f"{a['sizeBytes']} bytes", a["sha256"])
                for a in test["attachments"]
            ),
        )
        if test["attachments"]
        else Paragraph("None")
    )
    return [
        Heading(2, f"{test['id']} {test['title']}"),
        Fields(tuple(fields)),
        Heading(3, "Checks"),
        checks,
        Heading(3, "Attachments"),
        attachments,
    ]


def build(
    run: Mapping[str, Any],
    digest: str,
    matrix: Matrix,
    spec: Mapping[str, Any],
    options: Options,
    producer: str,
) -> Document:
    """Build the report document for one run file."""
    values = tokens(run, digest, spec, options)
    subtitle = (
        options.subtitle
        if options.subtitle is not None
        else themes.render(spec["texts"]["subtitle"], values)
    )
    roles = tuple(spec["signatures"]) if options.signatures is None else options.signatures
    blocks: list[Block] = [
        Heading(1, values["title"]),
        *_details(run, digest, options),
        *_summary(run, matrix),
    ]
    for test in run["tests"]:
        blocks += _test(test)
    if roles:
        blocks += [Heading(2, "Signatures"), Signatures(roles)]
    return Document(
        cover=Cover(
            spec["brand"]["name"], values["title"], subtitle, _cover_fields(spec, values, run)
        ),
        blocks=tuple(blocks),
        classification=values["classification"],
        header=spec["texts"]["header"],
        footer=spec["texts"]["footer"],
        tokens=values,
        metadata=Metadata(
            title=values["title"],
            subject=run["run"]["id"],
            keywords=f"sha256:{digest}",
            producer=producer,
            creation_date=options.generated_at,
        ),
    )
