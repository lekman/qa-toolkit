"""Process-wide state: options given in code, and the context of the running process."""

from __future__ import annotations

import os
import threading
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from qualify import envelope, redaction
from qualify.settings import NotApplicable, Options, Settings, evidence_path, resolve

_lock = threading.Lock()
_options = Options()
_process: Process | None = None


@dataclass(frozen=True)
class Process:
    """What every test in one process shares: settings, envelope and paths."""

    settings: Settings
    envelope: dict[str, object]
    root: str
    evidence_dir: str

    @property
    def records_dir(self) -> str:
        """``<evidenceDir>/records``"""
        return os.path.join(self.evidence_dir, "records")


def configure(
    *,
    environment: str | None = None,
    production: str | Sequence[str] | None = None,
    allow_write: str | Mapping[str, str] | None = None,
    no_overrides: bool | None = None,
    evidence_dir: str | None = None,
    attachment_limit: int | None = None,
    resolve_environment: Callable[[], str] | None = None,
    secret_source: Callable[[str], str | None] | None = None,
    not_applicable: Sequence[NotApplicable] = (),
) -> None:
    """Give settings in code, for example in ``conftest.py``.

    The ``QUALIFY_*`` environment variables and the ``qualify_*`` ini options
    still win over the same setting given here. ``resolve_environment``
    replaces the environment resolver (if it raises, the environment is
    ``production``), ``secret_source`` replaces the reader behind
    ``ctx.secret``, and ``not_applicable`` adds rules that skip tests.

    Call it before the first qualification test runs.
    """
    global _options
    with _lock:
        if _process is not None:
            raise RuntimeError(
                "qualify.configure() was called after a qualification test ran; "
                "call it in conftest.py, before the tests start"
            )
        _options = _options.merged(
            Options(
                environment=environment,
                production=production,
                allow_write=allow_write,
                no_overrides=no_overrides,
                evidence_dir=evidence_dir,
                attachment_limit=attachment_limit,
                resolve_environment=resolve_environment,
                secret_source=secret_source,
                not_applicable=tuple(not_applicable),
            )
        )


def options() -> Options:
    """The options given in code so far."""
    return _options


def settings(env: Mapping[str, str], ini: Options) -> Settings:
    """Resolve the settings: environment variables over ini options over code."""
    return resolve(env, _options.merged(ini))


def process(run_id: str, ini: Options, runner_runtime: str) -> Process:
    """The process context, built on first use from the current environment."""
    global _process
    with _lock:
        if _process is None or _process.envelope["id"] != run_id:
            env = dict(os.environ)
            resolved = resolve(env, _options.merged(ini))
            cwd = os.getcwd()
            git = envelope.read_git(cwd)
            run = envelope.build(
                run_id=run_id,
                environment=resolved.environment,
                policy=resolved.policy(),
                git=git,
                env=env,
                runner_runtime=runner_runtime,
            )
            _process = Process(
                settings=resolved,
                envelope=redaction.value(run),  # type: ignore[arg-type]
                root=git.root or cwd,
                evidence_dir=evidence_path(resolved, cwd),
            )
        return _process


def end_process() -> None:
    """Forget the process context, so the next session builds its own."""
    global _process
    with _lock:
        _process = None


def reset() -> None:
    """Forget the process context and the options. For tests of qualify itself."""
    global _process, _options
    with _lock:
        _process = None
        _options = Options()
