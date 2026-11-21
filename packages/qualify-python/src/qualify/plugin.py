"""The pytest plugin, registered through the ``pytest11`` entry point.

The outcome of a test comes from a ``pytest_runtest_makereport`` hook wrapper
that reads the exception of the phase that ended the test. It never relies on
``try`` around a fixture ``yield``, because pytest does not pass the test's
exception into a yield fixture.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest

from qualify import envelope, redaction, runtime
from qualify.api import Declared, declared
from qualify.cli import InputError, merge_directory, merge_line
from qualify.context import CheckFailed, Context
from qualify.declaration import Declaration, DeclarationError
from qualify.merge import MergeResult
from qualify.recorder import Recorder
from qualify.settings import ConfigurationError, Options

RUN_ID = pytest.StashKey[str]()
ROOT = pytest.StashKey[str]()
MERGE = pytest.StashKey[tuple[MergeResult, Path] | str]()
DECLARATION = pytest.StashKey[Declaration]()
RECORDER = pytest.StashKey[Recorder]()
POLICY_SKIP = pytest.StashKey[str]()

_WORKER_KEY = "qualify_run_id"
_INI = {
    "qualify_environment": "Environment name (QUALIFY_ENVIRONMENT wins). Default: local.",
    "qualify_production": "Comma-separated production environments (QUALIFY_PRODUCTION wins).",
    "qualify_allow_write": "ID=reason;... tests allowed to write in production.",
    "qualify_no_overrides": "true refuses every write override (QUALIFY_NO_OVERRIDES wins).",
    "qualify_evidence_dir": "Evidence folder, relative to the rootdir (QUALIFY_EVIDENCE_DIR wins).",
    "qualify_attachment_limit": "Bytes per attachment (QUALIFY_ATTACHMENT_LIMIT wins).",
}


class QualifyCollectionWarning(pytest.PytestWarning):
    """A qualification test that pytest will not collect."""


def pytest_addoption(parser: pytest.Parser) -> None:
    group = parser.getgroup("qualify", "qualification evidence")
    group.addoption(
        "--qualify-merge",
        action="store_true",
        default=False,
        help="merge the evidence into the run file when the session ends",
    )
    for name, text in _INI.items():
        parser.addini(name, text, default="")


def _is_worker(config: pytest.Config) -> bool:
    return hasattr(config, "workerinput")


def _ini(config: pytest.Config) -> Options:
    def get(name: str) -> str | None:
        value = str(config.getini(name)).strip()
        return value or None

    evidence = get("qualify_evidence_dir")
    flag = get("qualify_no_overrides")
    return Options(
        environment=get("qualify_environment"),
        production=get("qualify_production"),
        allow_write=get("qualify_allow_write"),
        no_overrides=None if flag is None else flag.lower() in ("1", "true", "yes"),
        evidence_dir=None if evidence is None else str(config.rootpath / evidence),
        attachment_limit=get("qualify_attachment_limit"),
    )


class _XdistHooks:
    """Hands the controller's run ID to every xdist worker."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id

    def pytest_configure_node(self, node: Any) -> None:
        node.workerinput[_WORKER_KEY] = self.run_id


def pytest_configure(config: pytest.Config) -> None:
    for line in (
        "qualify: a qualification test declared with qualify.iq, oq, pq or iu",
        "iq: an Installation Qualification test",
        "oq: an Operational Qualification test",
        "pq: a Performance Qualification test",
        "iu: an Intended Use test",
        "timeout(seconds): time limit, applied by pytest-timeout when installed",
    ):
        config.addinivalue_line("markers", line)
    config.pluginmanager.register(_PolicyHooks(), "qualify-policy")
    if _is_worker(config):
        run_id = config.workerinput.get(_WORKER_KEY)  # type: ignore[attr-defined]
    else:
        run_id = os.environ.get("QUALIFY_RUN_ID") or envelope.create_ulid()
        if config.pluginmanager.hasplugin("xdist"):
            config.pluginmanager.register(_XdistHooks(run_id), "qualify-xdist")
    config.stash[RUN_ID] = str(run_id or envelope.create_ulid())


def pytest_unconfigure(config: pytest.Config) -> None:
    runtime.reset()


def pytest_sessionstart(session: pytest.Session) -> None:
    """Fail the run before any test starts when a setting cannot be used."""
    runtime.end_process()
    run_id = session.config.stash[RUN_ID]
    if not envelope.is_ulid(run_id):
        raise pytest.UsageError(f"qualify: QUALIFY_RUN_ID {run_id} is not a ULID")
    try:
        runtime.settings(dict(os.environ), _ini(session.config))
    except ConfigurationError as error:
        raise pytest.UsageError(f"qualify: {error}") from error


def _root(config: pytest.Config) -> str:
    if ROOT not in config.stash:
        cwd = os.getcwd()
        config.stash[ROOT] = envelope.read_git(cwd).root or cwd
    return config.stash[ROOT]


class DeclarationErrorCollector(pytest.Collector):
    """Stands in for a qualification test whose declaration is invalid, so the
    error is reported at collection, one per test, and no evidence is written."""

    def __init__(self, *, error: Exception, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.error = error

    def collect(self) -> list[pytest.Item | pytest.Collector]:
        raise self.error

    def repr_failure(self, excinfo: pytest.ExceptionInfo[BaseException]) -> str:  # type: ignore[override]
        return f"qualify: {excinfo.value}"


def _parametrised(items: list[Any]) -> bool:
    return len(items) != 1 or hasattr(items[0], "callspec")


def _prepare(item: pytest.Item, declaration: Declaration) -> None:
    item.stash[DECLARATION] = declaration
    item.extra_keyword_matches.add(declaration.id)
    item.keywords[declaration.id] = True
    item.user_properties.append(("qualify_id", declaration.id))
    for tag in declaration.tags:
        item.config.addinivalue_line("markers", f"{tag}: qualify tag")
        item.add_marker(tag)


@pytest.hookimpl(wrapper=True)
def pytest_pycollect_makeitem(
    collector: pytest.Module | pytest.Class, name: str, obj: object
) -> Generator[None, Any, Any]:
    result = yield
    found: Declared | None = declared(obj)
    if found is None:
        return result
    if result is None:
        collector.warn(
            QualifyCollectionWarning(
                f"{found.id} is declared on {name}, which pytest does not collect; "
                "name the function test_..."
            )
        )
        return result
    items = result if isinstance(result, list) else [result]
    try:
        declaration = found.declaration(_root(collector.config))
        if not all(isinstance(i, pytest.Function) for i in items) or _parametrised(items):
            raise DeclarationError(
                declaration.id,
                [
                    "parametrised qualification tests are refused, because one ID would map "
                    "to several records; declare each case with its own ID"
                ],
            )
    except DeclarationError as error:
        return [DeclarationErrorCollector.from_parent(collector, name=name, error=error)]
    for item in items:
        _prepare(item, declaration)
    return result


@pytest.fixture
def ctx(request: pytest.FixtureRequest) -> Context:
    """The qualification context: checks, attachments, secrets and runtime skip."""
    recorder = request.node.stash.get(RECORDER, None)
    if recorder is None:
        raise pytest.UsageError(
            f"{request.node.nodeid}: the ctx fixture is only for qualification tests, "
            "declared with @qualify.iq, oq, pq or iu"
        )
    context: Context = recorder.context
    return context


@pytest.hookimpl(wrapper=True, tryfirst=True)
def pytest_runtest_setup(item: pytest.Item) -> Generator[None, None, None]:
    """Write the started marker before any other plugin's setup runs."""
    declaration = item.stash.get(DECLARATION, None)
    if declaration is not None:
        process = runtime.process(
            item.config.stash[RUN_ID], _ini(item.config), envelope.pytest_runtime()
        )
        recorder = Recorder(declaration, process, str(item.path))
        item.stash[RECORDER] = recorder
        recorder.start()
    return (yield)


class _PolicyHooks:
    """Skips a test the policy blocks, before its fixtures run.

    A plain hook, not part of the wrapper above: a wrapper that raises before
    it yields stops the other plugins' wrappers from setting up, and their
    teardown then fails.
    """

    @pytest.hookimpl(tryfirst=True)
    def pytest_runtest_setup(self, item: pytest.Item) -> None:
        recorder = item.stash.get(RECORDER, None)
        reason = recorder.policy_skip() if recorder is not None else None
        if reason is not None:
            item.stash[POLICY_SKIP] = reason
            pytest.skip(reason)


@pytest.hookimpl(wrapper=True)
def pytest_pyfunc_call(pyfuncitem: pytest.Function) -> Generator[None, object, object]:
    result = yield
    recorder = pyfuncitem.stash.get(RECORDER, None)
    if recorder is not None:
        soft = recorder.context.soft_failures()
        hard = [c for c in recorder.context.checks if not c.soft and not c.passed]
        if soft:
            raise CheckFailed(f"{len(soft)} soft check(s) failed", soft[0].site)
        if hard:
            # A hard check failed and the body caught its CheckFailed.
            raise CheckFailed(f"{hard[0].context}: {hard[0].description}", hard[0].site)
    return result


def _redact_report(report: pytest.TestReport) -> None:
    registered = redaction.registry.values()
    if not registered:
        return
    if report.longrepr is not None:
        text = str(report.longrepr)
        clean = redaction.text(text, registered)
        if clean != text:
            report.longrepr = clean
    report.sections = [(title, redaction.text(body, registered)) for title, body in report.sections]


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(
    item: pytest.Item, call: pytest.CallInfo[None]
) -> Generator[None, pytest.TestReport, pytest.TestReport]:
    report = yield
    recorder = item.stash.get(RECORDER, None)
    if recorder is not None and not recorder.finished and call.when in ("setup", "call"):
        excinfo = call.excinfo
        error = excinfo.value if excinfo is not None else None
        if call.when == "call" or error is not None:
            policy = item.stash.get(POLICY_SKIP, None)
            recorder.finish(
                None if policy is not None else error,
                excinfo.tb if excinfo is not None else None,
                skip_reason=policy,
            )
    _redact_report(report)
    return report


def pytest_sessionfinish(session: pytest.Session) -> None:
    config = session.config
    if _is_worker(config) or not config.getoption("qualify_merge"):
        return
    try:
        settings = runtime.settings(dict(os.environ), _ini(config))
        config.stash[MERGE] = merge_directory(settings.evidence_dir)
    except (InputError, ConfigurationError) as error:
        config.stash[MERGE] = f"qualify merge: {error}"


def pytest_terminal_summary(terminalreporter: Any, config: pytest.Config) -> None:
    outcome = config.stash.get(MERGE, None)
    if outcome is None:
        return
    terminalreporter.section("qualify")
    if isinstance(outcome, str):
        terminalreporter.write_line(outcome, red=True)
        return
    result, target = outcome
    if result.file is None:
        for error in result.errors:
            terminalreporter.write_line(f"qualify merge: {error}", red=True)
        terminalreporter.write_line("qualify merge: no run file written", red=True)
        return
    terminalreporter.write_line(merge_line(result, target))
