from __future__ import annotations

import pytest

from qualify import runtime
from qualify.declaration import Narrative, validate
from qualify.settings import (
    DEFAULT_ATTACHMENT_LIMIT,
    ConfigurationError,
    NotApplicable,
    Options,
    Override,
    resolve,
)

WRITE = validate(
    "OQ", "OQ-AREA-001", "T", Narrative("g", "w", "t", scope="read-write", tags=["gpu"]), "a:1"
)


def test_defaults() -> None:
    settings = resolve({})
    assert settings.environment == "local"
    assert settings.production == ("production", "prod")
    assert settings.evidence_dir == "qualification/evidence"
    assert settings.attachment_limit == DEFAULT_ATTACHMENT_LIMIT
    assert settings.policy() == {"productionWriteBlocked": False, "overrides": []}
    assert settings.read_secret("X") is None


def test_environment_variables_win_over_options() -> None:
    env = {
        "QUALIFY_ENVIRONMENT": " staging ",
        "QUALIFY_PRODUCTION": "staging, live",
        "QUALIFY_EVIDENCE_DIR": "out",
        "QUALIFY_ATTACHMENT_LIMIT": "16",
        "QUALIFY_SECRET_TOKEN": "value",
    }
    options = Options(environment="dev", production="dev", evidence_dir="other", attachment_limit=1)
    settings = resolve(env, options)
    assert (settings.environment, settings.production) == ("staging", ("staging", "live"))
    assert (settings.evidence_dir, settings.attachment_limit) == ("out", 16)
    assert settings.read_secret("TOKEN") == "value"
    assert settings.production_write_blocked


def test_a_resolver_that_fails_means_production() -> None:
    def broken() -> str:
        raise RuntimeError("no")

    assert resolve({}, Options(resolve_environment=broken)).environment == "production"
    assert resolve({}, Options(resolve_environment=lambda: " ")).environment == "production"
    assert resolve({}, Options(resolve_environment=lambda: "dev")).environment == "dev"


def test_write_protection_and_overrides() -> None:
    blocked = resolve({"QUALIFY_ENVIRONMENT": "prod"})
    assert blocked.skip_reason(WRITE) == "read-write test blocked in production environment prod"
    allowed = resolve(
        {"QUALIFY_ENVIRONMENT": "prod", "QUALIFY_ALLOW_WRITE": " OQ-AREA-001 = needed ; "}
    )
    assert allowed.overrides == (Override("OQ-AREA-001", "needed"),)
    assert allowed.skip_reason(WRITE) is None
    assert allowed.policy()["overrides"] == [{"id": "OQ-AREA-001", "reason": "needed"}]
    mapped = resolve({}, Options(allow_write={"OQ-AREA-001": "r"}))
    assert mapped.overrides == (Override("OQ-AREA-001", "r"),)


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({"QUALIFY_ALLOW_WRITE": "nope=x"}, "nope, which is not a test ID"),
        ({"QUALIFY_ALLOW_WRITE": "OQ-AREA-001"}, "gives no reason for OQ-AREA-001"),
        ({"QUALIFY_ALLOW_WRITE": "OQ-AREA-001=a;OQ-AREA-001=b"}, "names OQ-AREA-001 twice"),
        (
            {"QUALIFY_ALLOW_WRITE": "OQ-AREA-001=a", "QUALIFY_NO_OVERRIDES": "1"},
            "refuses every override",
        ),
        ({"QUALIFY_ATTACHMENT_LIMIT": "lots"}, "whole number of bytes"),
        ({"QUALIFY_ATTACHMENT_LIMIT": "-1"}, "whole number of bytes"),
    ],
)
def test_invalid_settings(env: dict[str, str], message: str) -> None:
    with pytest.raises(ConfigurationError, match=message):
        resolve(env)


def test_no_overrides_from_options() -> None:
    with pytest.raises(ConfigurationError):
        resolve({}, Options(no_overrides=True, allow_write="OQ-AREA-001=a"))
    assert resolve(
        {"QUALIFY_NO_OVERRIDES": "0"}, Options(no_overrides=True, allow_write="OQ-AREA-001=a")
    )


def test_not_applicable_rules() -> None:
    rule = NotApplicable("no GPU here", tags=["gpu"], environments=["ci"])
    assert (
        resolve({"QUALIFY_ENVIRONMENT": "ci"}, Options(not_applicable=(rule,))).skip_reason(WRITE)
        == "no GPU here"
    )
    assert resolve({}, Options(not_applicable=(rule,))).skip_reason(WRITE) is None
    assert NotApplicable("always").matches(WRITE, "anywhere")


def test_configure_merges_and_refuses_once_a_test_ran() -> None:
    runtime.configure(environment="dev", not_applicable=[NotApplicable("x")])
    runtime.configure(production="dev")
    assert runtime.options().environment == "dev"
    assert runtime.options().production == "dev"
    assert len(runtime.options().not_applicable) == 1
    settings = runtime.settings({}, Options(environment="ini"))
    assert settings.environment == "ini"
    runtime.process("01HQA1ZQJ0C0NF0RMANCE00000", Options(), "python; pytest")
    with pytest.raises(RuntimeError, match="before the tests start"):
        runtime.configure(environment="late")
