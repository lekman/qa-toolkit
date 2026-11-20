"""The ``qualify`` command (specification section 8): ``merge``, ``validate`` and ``report``.

``trace`` is in the TypeScript package only; this command points to it.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, NoReturn, TextIO

from qualify import envelope, schema
from qualify.evidence import RECORDS, RUN_FILE, sidecar, write_atomic
from qualify.jsontext import EVIDENCE_SHAPE, document
from qualify.merge import MergeInput, MergeResult, build
from qualify.settings import ConfigurationError, resolve
from qualify.values import timestamp

OK, FAILED, INVALID, INCOMPLETE, USAGE = 0, 1, 2, 3, 64

USAGE_TEXT = """\
Usage:
  qualify merge    [--evidence-dir DIR] [--allow-runs ID,ID] [--out FILE]
  qualify validate FILE...
  qualify report   RUNFILE --pdf FILE [--protocol protocol.yaml] [--map trace.yaml]
                   [--theme NAME|PATH] [--title TEXT] [--subtitle TEXT]
                   [--document-id TEXT] [--classification TEXT]
                   [--signatures ROLE;ROLE;...] [--no-signatures]
  qualify --help | --version

qualify trace is in the TypeScript package: npx @lekman/qualify trace ...

Exit codes: 0 pass, 1 fail or error, 2 invalid input, 3 incomplete, 64 usage.
"""

TRACE_TEXT = """\
qualify: trace is not part of the Python package. Run the TypeScript CLI on
the run file this package writes; it needs Node 20 or later:

  npx @lekman/qualify trace qualification/evidence/test-evidence.json \\
    --protocol protocol.yaml --md trace.md --json trace.json
"""


class UsageError(Exception):
    """How the command was called is wrong. Exit 64."""


class InputError(Exception):
    """An input cannot be used. Exit 2."""


@dataclass
class IO:
    """Everything the commands touch outside themselves."""

    env: Mapping[str, str] = field(default_factory=lambda: dict(os.environ))
    cwd: Callable[[], str] = os.getcwd
    now: Callable[[], dt.datetime] = lambda: dt.datetime.now(dt.timezone.utc)
    stdout: TextIO = field(default_factory=lambda: sys.stdout)
    stderr: TextIO = field(default_factory=lambda: sys.stderr)


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        raise UsageError(message)


def _path(io: IO, path: str) -> Path:
    return Path(io.cwd(), path).resolve()


def _read(io: IO, path: str) -> bytes:
    try:
        return _path(io, path).read_bytes()
    except OSError as error:
        raise InputError(f"cannot read {path}: {error.strerror or error}") from error


def _check_sidecar(io: IO, path: str, data: bytes) -> None:
    side = Path(f"{_path(io, path)}.sha256")
    if not side.is_file():
        return
    recorded = side.read_text("utf-8").strip().split()
    if not recorded or recorded[0] != sidecar(data, "").split()[0]:
        raise InputError(f"{path}: the SHA-256 does not match {path}.sha256")


def _empty_envelope(io: IO) -> dict[str, object]:
    settings = resolve(io.env)
    run_id = io.env.get("QUALIFY_RUN_ID", "")
    return envelope.build(
        run_id=run_id if envelope.is_ulid(run_id) else envelope.create_ulid(),
        environment=settings.environment,
        policy=settings.policy(),
        git=envelope.read_git(io.cwd()),
        env=io.env,
        runner_runtime=envelope.runtime("qualify merge"),
    )


def merge_directory(
    evidence_dir: str | Path,
    allow_runs: Sequence[str] = (),
    out: str | Path | None = None,
    io: IO | None = None,
) -> tuple[MergeResult, Path]:
    """Merge ``<evidence_dir>/records`` and write the run file and its sidecar.

    Returns the result and the run file's path. Nothing is written when the
    input is invalid (exit code 2).
    """
    io = io or IO()
    directory = Path(io.cwd(), evidence_dir).resolve()
    target = Path(io.cwd(), out).resolve() if out is not None else directory / RUN_FILE
    records = directory / RECORDS
    inputs = []
    if records.is_dir():
        for entry in sorted(records.iterdir()):
            if entry.name.startswith("."):
                continue
            try:
                inputs.append(MergeInput(entry.name, entry.read_bytes().decode("utf-8")))
            except (OSError, UnicodeDecodeError) as error:
                raise InputError(f"cannot read {entry.name}: {error}") from error
    elif records.exists():
        raise InputError(f"{records} is not a folder")
    result = build(
        inputs,
        list(allow_runs),
        empty_envelope=lambda: _empty_envelope(io),
        now=lambda: timestamp(io.now()),
    )
    if result.file is None:
        return result, target
    problems = schema.evidence(result.file)
    if problems:
        raise InputError(f"the merged run file is not valid: {'; '.join(problems)}")
    text = document(result.file, EVIDENCE_SHAPE).encode("utf-8")
    write_atomic(target, text)
    write_atomic(f"{target}.sha256", sidecar(text, target.name))
    return result, target


def merge_line(result: MergeResult, target: Path) -> str:
    """The one-line summary ``merge`` prints."""
    assert result.file is not None
    s = result.file["summary"]
    return (
        f"qualify merge: {s['total']} tests, {s['pass']} pass, {s['fail']} fail, "
        f"{s['error']} error, {s['skip']} skip; verdict {s['verdict']}; wrote {target}"
    )


def _merge(args: list[str], io: IO) -> int:
    parser = _Parser(prog="qualify merge", add_help=False)
    parser.add_argument("--evidence-dir")
    parser.add_argument("--allow-runs", default="")
    parser.add_argument("--out")
    options = parser.parse_args(args)
    allow = [i.strip() for i in options.allow_runs.split(",") if i.strip()]
    for run_id in allow:
        if not envelope.is_ulid(run_id):
            raise UsageError(f"--allow-runs: {run_id} is not a run ID")
    directory = (
        options.evidence_dir or io.env.get("QUALIFY_EVIDENCE_DIR") or "qualification/evidence"
    )
    result, target = merge_directory(directory, allow, options.out, io)
    if result.file is None:
        for error in result.errors:
            print(f"qualify merge: {error}", file=io.stderr)
        print("qualify merge: no run file written", file=io.stderr)
        return INVALID
    print(merge_line(result, target), file=io.stdout)
    return result.exit_code


def _validate(args: list[str], io: IO) -> int:
    if not args:
        raise UsageError("validate needs at least one file")
    if any(a.startswith("-") for a in args):
        raise UsageError(
            f"validate takes no options, got {next(a for a in args if a.startswith('-'))}"
        )
    invalid = 0
    for path in args:
        try:
            data = _read(io, path)
            _check_sidecar(io, path, data)
            try:
                parsed = json.loads(data.decode("utf-8"))
            except ValueError as error:
                raise InputError(f"{path}: not valid JSON ({error})") from error
            is_trace = isinstance(parsed, dict) and parsed.get("kind") == "trace"
            problems = schema.trace(parsed) if is_trace else schema.evidence(parsed)
            if problems:
                raise InputError(f"{path}: {'; '.join(problems)}")
            print(f"valid: {path}", file=io.stdout)
        except InputError as error:
            invalid += 1
            print(f"qualify validate: {error}", file=io.stderr)
    return OK if invalid == 0 else INVALID


_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")


def _report_time(io: IO) -> dt.datetime:
    """The generation time: ``QUALIFY_REPORT_TIME`` when set, else now."""
    value = io.env.get("QUALIFY_REPORT_TIME", "")
    if not value:
        return io.now()
    try:
        if not _INSTANT.match(value):
            raise ValueError(value)
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise InputError(
            "QUALIFY_REPORT_TIME must be a UTC instant such as 2026-01-02T03:04:05.006Z, "
            f"got {value}"
        ) from error


def _run_file(io: IO, path: str) -> tuple[dict[str, Any], str]:
    """A run file's validated content and the SHA-256 of its bytes as read."""
    data = _read(io, path)
    _check_sidecar(io, path, data)
    try:
        parsed = json.loads(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        raise InputError(f"{path}: not valid JSON ({error})") from error
    problems = schema.evidence(parsed)
    if problems:
        raise InputError(f"{path}: {'; '.join(problems)}")
    if parsed["kind"] != "run":
        raise InputError(f"{path}: expected a run file; run qualify merge first")
    return parsed, hashlib.sha256(data).hexdigest()


def _report(args: list[str], io: IO) -> int:
    from qualify import theme as themes
    from qualify import trace
    from qualify.report import content, pdf

    parser = _Parser(prog="qualify report", add_help=False)
    parser.add_argument("run_file", nargs="*")
    for name in (
        "--pdf",
        "--protocol",
        "--map",
        "--theme",
        "--title",
        "--subtitle",
        "--document-id",
        "--classification",
        "--signatures",
    ):
        parser.add_argument(name)
    parser.add_argument("--no-signatures", action="store_true")
    options = parser.parse_args(args)
    if len(options.run_file) != 1:
        raise UsageError("report takes exactly one run file")
    if options.pdf is None:
        raise UsageError("report needs --pdf FILE")
    if options.no_signatures and options.signatures is not None:
        raise UsageError("--signatures and --no-signatures exclude each other")
    for flag in ("title", "document_id", "theme"):
        value = getattr(options, flag)
        if value is not None and not value.strip():
            raise UsageError(f"--{flag.replace('_', '-')} must not be empty")
    roles: tuple[str, ...] | None = None
    if options.no_signatures:
        roles = ()
    elif options.signatures is not None:
        roles = tuple(r.strip() for r in options.signatures.split(";") if r.strip())
        if not roles:
            raise UsageError("--signatures names no role")

    generated = _report_time(io)
    reference = options.theme or io.env.get("QUALIFY_REPORT_THEME") or themes.DEFAULT
    try:
        theme = themes.load(reference, io.cwd())
    except themes.ThemeError as error:
        raise InputError(str(error)) from error
    run, digest = _run_file(io, options.run_file[0])
    try:
        protocol = (
            trace.read_protocol(_read(io, options.protocol).decode("utf-8"), options.protocol)
            if options.protocol
            else []
        )
        mapped = (
            trace.read_map(_read(io, options.map).decode("utf-8"), options.map)
            if options.map
            else {}
        )
    except (trace.TraceInputError, UnicodeDecodeError) as error:
        raise InputError(str(error)) from error
    producer = f"{envelope.TOOL_NAME} {envelope.tool_version()}"
    report = content.build(
        run,
        digest,
        trace.build(run, protocol, mapped),
        theme.spec,
        content.Options(
            generated_at=generated,
            title=options.title,
            subtitle=options.subtitle,
            document_id=options.document_id,
            classification=options.classification,
            signatures=roles,
        ),
        producer,
    )
    target = _path(io, options.pdf)
    write_atomic(target, pdf.render(report, theme, producer))
    print(
        f"qualify report: wrote {target} with theme {theme.spec['name']}; "
        f"run verdict {run['summary']['verdict']}",
        file=io.stdout,
    )
    return OK


def run(argv: Sequence[str], io: IO | None = None) -> int:
    """Run the command with its arguments (without the program name). Returns the exit code."""
    io = io or IO()
    command, *rest = list(argv) or [""]
    try:
        if command in ("--help", "-h"):
            io.stdout.write(USAGE_TEXT)
            return OK
        if command in ("--version", "-v"):
            print(envelope.tool_version(), file=io.stdout)
            return OK
        if command == "merge":
            return _merge(rest, io)
        if command == "validate":
            return _validate(rest, io)
        if command == "report":
            return _report(rest, io)
        if command == "trace":
            io.stderr.write(TRACE_TEXT)
            return USAGE
        raise UsageError("no command given" if command == "" else f"unknown command {command}")
    except UsageError as error:
        io.stderr.write(f"qualify: {error}\n\n{USAGE_TEXT}")
        return USAGE
    except (InputError, ConfigurationError) as error:
        print(f"qualify: {error}", file=io.stderr)
        return INVALID


def main() -> NoReturn:
    """The console script."""
    sys.exit(run(sys.argv[1:]))
