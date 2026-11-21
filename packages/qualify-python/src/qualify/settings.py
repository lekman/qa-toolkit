"""Settings, write protection and "not applicable" rules (specification section 5).

Settings come from three places. ``QUALIFY_*`` environment variables win over
the pytest configuration (``qualify_*`` ini options), which wins over
:func:`qualify.configure` in code. :func:`resolve` is pure: the caller passes
the variables and the other sources in.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace

from qualify.declaration import Declaration, is_test_id

DEFAULT_EVIDENCE_DIR = "qualification/evidence"
DEFAULT_ATTACHMENT_LIMIT = 1024 * 1024
DEFAULT_PRODUCTION = ("production", "prod")


class ConfigurationError(Exception):
    """A setting that cannot be used. The run fails before any test starts."""


@dataclass(frozen=True)
class NotApplicable:
    """Skips matching tests with a reason.

    A rule matches a test that carries any of ``tags`` (or any test when
    ``tags`` is ``None``) in any of ``environments`` (or any environment when
    ``environments`` is ``None``).
    """

    reason: str
    tags: Sequence[str] | None = None
    environments: Sequence[str] | None = None

    def matches(self, declaration: Declaration, environment: str) -> bool:
        """Whether the rule skips this test in this environment."""
        tag_match = self.tags is None or any(t in declaration.tags for t in self.tags)
        env_match = self.environments is None or environment in self.environments
        return tag_match and env_match


@dataclass(frozen=True)
class Options:
    """Settings given in code or in the pytest configuration. ``None`` means not given."""

    environment: str | None = None
    production: str | Sequence[str] | None = None
    allow_write: str | Mapping[str, str] | None = None
    no_overrides: bool | None = None
    evidence_dir: str | None = None
    attachment_limit: int | str | None = None
    resolve_environment: Callable[[], str] | None = None
    secret_source: Callable[[str], str | None] | None = None
    not_applicable: tuple[NotApplicable, ...] = ()

    def merged(self, other: Options) -> Options:
        """These options with every value ``other`` gives laid over them."""
        changes = {
            name: getattr(other, name)
            for name in self.__dataclass_fields__
            if getattr(other, name) not in (None, ())
        }
        return replace(self, **changes)


@dataclass(frozen=True)
class Override:
    """A test allowed to write in production, with the reason."""

    id: str
    reason: str


@dataclass(frozen=True)
class Settings:
    """Settings after resolving the environment variables and the options."""

    environment: str
    production: tuple[str, ...]
    overrides: tuple[Override, ...]
    evidence_dir: str
    attachment_limit: int
    read_secret: Callable[[str], str | None]
    not_applicable: tuple[NotApplicable, ...] = field(default_factory=tuple)

    @property
    def production_write_blocked(self) -> bool:
        """Whether ``read-write`` tests are skipped in this environment."""
        return self.environment in self.production

    def policy(self) -> dict[str, object]:
        """The policy as the run envelope records it."""
        return {
            "productionWriteBlocked": self.production_write_blocked,
            "overrides": [{"id": o.id, "reason": o.reason} for o in self.overrides],
        }

    def skip_reason(self, declaration: Declaration) -> str | None:
        """Why a test is skipped before its body runs, or ``None`` to run it."""
        if (
            self.production_write_blocked
            and declaration.scope == "read-write"
            and all(o.id != declaration.id for o in self.overrides)
        ):
            return f"read-write test blocked in production environment {self.environment}"
        for rule in self.not_applicable:
            if rule.matches(declaration, self.environment):
                return rule.reason
        return None


def _given(value: str | None) -> str | None:
    return None if value is None or value.strip() == "" else value


def _flag(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes")


def environment_name(env: Mapping[str, str], options: Options) -> str:
    """The environment name. A configured resolver that throws means ``production``."""
    if options.resolve_environment is not None:
        try:
            name = options.resolve_environment()
        except Exception:
            return "production"
        return name.strip() if isinstance(name, str) and name.strip() else "production"
    given = _given(env.get("QUALIFY_ENVIRONMENT")) or _given(options.environment)
    return given.strip() if given else "local"


def parse_overrides(value: str | Mapping[str, str]) -> tuple[Override, ...]:
    """Parse ``QUALIFY_ALLOW_WRITE``: ``ID=reason`` pairs separated by ``;``."""
    if isinstance(value, str):
        pairs = []
        for entry in (e.strip() for e in value.split(";")):
            if entry:
                name, _, reason = entry.partition("=")
                pairs.append((name.strip(), reason.strip()))
    else:
        pairs = [(k.strip(), v.strip()) for k, v in value.items()]
    seen: set[str] = set()
    result = []
    for test_id, reason in pairs:
        if not is_test_id(test_id):
            raise ConfigurationError(f"QUALIFY_ALLOW_WRITE names {test_id}, which is not a test ID")
        if not reason:
            raise ConfigurationError(
                f"QUALIFY_ALLOW_WRITE gives no reason for {test_id}; write {test_id}=<reason>"
            )
        if test_id in seen:
            raise ConfigurationError(f"QUALIFY_ALLOW_WRITE names {test_id} twice")
        seen.add(test_id)
        result.append(Override(test_id, reason))
    return tuple(result)


def _limit(value: int | str | None) -> int:
    if value is None:
        return DEFAULT_ATTACHMENT_LIMIT
    try:
        limit = value if isinstance(value, int) else int(value.strip())
    except ValueError:
        limit = -1
    if limit < 0 or isinstance(value, bool):
        raise ConfigurationError(
            f"QUALIFY_ATTACHMENT_LIMIT must be a whole number of bytes, got {value}"
        )
    return limit


def _list(value: str | Sequence[str]) -> tuple[str, ...]:
    items = value.split(",") if isinstance(value, str) else list(value)
    return tuple(i.strip() for i in items if i.strip())


def resolve(env: Mapping[str, str], options: Options = Options()) -> Settings:
    """Resolve every setting. An invalid setting raises :class:`ConfigurationError`."""
    environment = environment_name(env, options)
    production_value = _given(env.get("QUALIFY_PRODUCTION")) or options.production
    production = DEFAULT_PRODUCTION if production_value is None else _list(production_value)

    allow = _given(env.get("QUALIFY_ALLOW_WRITE")) or options.allow_write
    overrides = () if allow is None else parse_overrides(allow)
    no_overrides_value = _given(env.get("QUALIFY_NO_OVERRIDES"))
    no_overrides = (
        _flag(no_overrides_value) if no_overrides_value is not None else bool(options.no_overrides)
    )
    if no_overrides and overrides:
        names = ", ".join(o.id for o in overrides)
        raise ConfigurationError(
            f"QUALIFY_NO_OVERRIDES refuses every override, and QUALIFY_ALLOW_WRITE gives {names}"
        )

    def default_secret(name: str) -> str | None:
        return env.get(f"QUALIFY_SECRET_{name}")

    return Settings(
        environment=environment,
        production=production,
        overrides=overrides,
        evidence_dir=_given(env.get("QUALIFY_EVIDENCE_DIR"))
        or _given(options.evidence_dir)
        or DEFAULT_EVIDENCE_DIR,
        attachment_limit=_limit(
            _given(env.get("QUALIFY_ATTACHMENT_LIMIT")) or options.attachment_limit
        ),
        read_secret=options.secret_source or default_secret,
        not_applicable=tuple(options.not_applicable),
    )


def evidence_path(settings: Settings, cwd: str | None = None) -> str:
    """The evidence directory as an absolute path."""
    return os.path.abspath(os.path.join(cwd or os.getcwd(), settings.evidence_dir))
