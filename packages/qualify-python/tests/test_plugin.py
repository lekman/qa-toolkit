"""The plugin, run in-process through pytester against small test files."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000"

HEADER = """
import pytest
import qualify

def declare(level, test_id, **extra):
    narrative = dict(given="g", when="w", then="t")
    if level in ("oq", "pq") and "scope" not in extra:
        narrative["scope"] = "read"
    narrative.update(extra)
    return getattr(qualify, level)(test_id, "title of " + test_id, **narrative)
"""


@pytest.fixture
def evidence(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch) -> Path:
    directory = pytester.path / "evidence"
    monkeypatch.setenv("QUALIFY_EVIDENCE_DIR", str(directory))
    monkeypatch.setenv("QUALIFY_RUN_ID", RUN_ID)
    return directory


def records_by_id(directory: Path) -> dict[str, dict[str, Any]]:
    """The records written so far, by test ID."""
    found = {}
    for path in sorted((directory / "records").glob("*.json")):
        test = json.loads(path.read_text("utf-8"))["test"]
        found[test["id"]] = test
    return found


def markers(directory: Path) -> list[str]:
    return sorted(p.name for p in (directory / "records").glob("*.started"))


def test_outcomes_come_from_the_phase_that_ended_the_test(
    pytester: pytest.Pytester, evidence: Path
) -> None:
    pytester.makepyfile(
        HEADER
        + """
@pytest.fixture
def broken():
    raise KeyError("no fixture")

@declare("iq", "IQ-AREA-001")
def test_pass(ctx):
    ctx.check("c", "d").that(1).equals(1)

@declare("oq", "OQ-AREA-002")
def test_hard(ctx):
    ctx.check("c", "fails").that(1).equals(2)

@declare("oq", "OQ-AREA-003")
def test_error(ctx):
    raise RuntimeError("boom")

@declare("oq", "OQ-AREA-004")
def test_assert(ctx):
    assert 1 == 2, "plain"

@declare("oq", "OQ-AREA-005")
def test_runner_fail(ctx):
    pytest.fail("said so")

@declare("oq", "OQ-AREA-006")
def test_skip(ctx):
    pytest.skip("not today")

@declare("oq", "OQ-AREA-007")
def test_xfail(ctx):
    pytest.xfail("known")

@pytest.mark.skip(reason="marked")
@declare("oq", "OQ-AREA-008")
def test_skip_marker(ctx):
    pass

@declare("oq", "OQ-AREA-009")
def test_setup_error(ctx, broken):
    pass

@declare("oq", "OQ-AREA-010")
def test_soft(ctx):
    ctx.check("c", "soft one").soft().that(1).equals(2)
    ctx.check("c", "soft two").soft().that(1).equals(3)

@declare("oq", "OQ-AREA-011")
def test_swallowed(ctx):
    try:
        ctx.check("c", "caught").that(1).equals(2)
    except qualify.CheckFailed:
        pass

@declare("oq", "OQ-AREA-012")
def test_no_ctx():
    pass
"""
    )
    result = pytester.runpytest("-p", "no:cacheprovider")
    result.assert_outcomes(passed=2, failed=6, errors=1, skipped=2, xfailed=1)
    found = records_by_id(evidence)
    outcome = {k: v["outcome"] for k, v in found.items()}
    assert outcome == {
        "IQ-AREA-001": "pass",
        "OQ-AREA-002": "fail",
        "OQ-AREA-003": "error",
        "OQ-AREA-004": "fail",
        "OQ-AREA-005": "fail",
        "OQ-AREA-006": "skip",
        "OQ-AREA-007": "skip",
        "OQ-AREA-008": "skip",
        "OQ-AREA-009": "error",
        "OQ-AREA-010": "fail",
        "OQ-AREA-011": "fail",
        "OQ-AREA-012": "pass",
    }
    assert found["OQ-AREA-002"]["error"]["message"] == "c: fails"
    assert found["OQ-AREA-003"]["error"]["type"] == "RuntimeError"
    assert found["OQ-AREA-003"]["error"]["site"].startswith("test_outcomes_come_from")
    assert found["OQ-AREA-004"]["error"]["type"] == "AssertionError"
    assert found["OQ-AREA-005"]["error"]["type"] == "Failed"
    assert found["OQ-AREA-006"]["skipReason"] == "not today"
    assert found["OQ-AREA-007"]["skipReason"] == "xfail: known"
    assert found["OQ-AREA-008"]["skipReason"] == "marked"
    assert found["OQ-AREA-009"]["error"]["type"] == "KeyError"
    assert found["OQ-AREA-010"]["error"]["message"] == "2 soft check(s) failed"
    assert found["OQ-AREA-010"]["error"]["site"] == found["OQ-AREA-010"]["checks"][0]["site"]
    assert found["OQ-AREA-011"]["error"]["message"] == "c: caught"
    assert len(markers(evidence)) == 12


def test_selection_by_id_level_and_tag(pytester: pytest.Pytester, evidence: Path) -> None:
    pytester.makepyfile(
        HEADER
        + """
@declare("oq", "OQ-CONF-001", tags=["slow", "export"])
def test_one(ctx):
    pass

@declare("pq", "PQ-CONF-002")
def test_two(ctx):
    pass

def test_plain():
    pass
"""
    )
    pytester.runpytest(
        "-p", "no:cacheprovider", "--strict-markers", "-k", "OQ-CONF-001"
    ).assert_outcomes(passed=1, deselected=2)
    assert list(records_by_id(evidence)) == ["OQ-CONF-001"]
    pytester.runpytest("-p", "no:cacheprovider", "-m", "pq").assert_outcomes(passed=1, deselected=2)
    pytester.runpytest("-p", "no:cacheprovider", "-m", "qualify and not slow").assert_outcomes(
        passed=1, deselected=2
    )
    pytester.runpytest("-p", "no:cacheprovider", "-m", "export").assert_outcomes(
        passed=1, deselected=2
    )
    assert sorted(records_by_id(evidence)) == ["OQ-CONF-001", "PQ-CONF-002"]
    assert records_by_id(evidence)["OQ-CONF-001"]["tags"] == ["export", "slow"]


def test_declaration_errors_fail_collection_one_per_test(
    pytester: pytest.Pytester, evidence: Path
) -> None:
    pytester.makepyfile(
        HEADER
        + """
@declare("oq", "OQ-bad-001")
def test_bad(ctx):
    pass

@declare("oq", "OQ-AREA-002", scope=None)
def test_no_scope(ctx):
    pass

@pytest.mark.parametrize("n", [1, 2])
@declare("oq", "OQ-AREA-003")
def test_parametrised(ctx, n):
    pass

@declare("oq", "OQ-AREA-004", timeout_ms=0)
def test_bad_timeout(ctx):
    pass

@declare("oq", "OQ-AREA-005")
def not_a_test(ctx):
    pass
"""
    )
    result = pytester.runpytest("-p", "no:cacheprovider", "-W", "default")
    assert result.ret == pytest.ExitCode.INTERRUPTED
    result.stdout.fnmatch_lines(
        [
            "*qualify: OQ-bad-001: ID does not match the pattern*",
            "*qualify: OQ-AREA-002: scope is required for OQ tests*",
            "*qualify: OQ-AREA-003: parametrised qualification tests are refused*",
            "*qualify: OQ-AREA-004: timeout_ms must be a positive number*",
            "*OQ-AREA-005 is declared on not_a_test, which pytest does not collect*",
            "*4 errors*",
        ]
    )
    assert not (evidence / "records").exists()


def test_policy_skips_before_fixtures_and_rules_from_configure(
    pytester: pytest.Pytester, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("QUALIFY_ENVIRONMENT", "production")
    pytester.makeconftest(
        """
import qualify
qualify.configure(not_applicable=[qualify.NotApplicable("no GPU here", tags=["gpu"])])
"""
    )
    pytester.makepyfile(
        HEADER
        + """
@pytest.fixture
def must_not_run():
    raise AssertionError("the fixture ran")

@declare("oq", "OQ-AREA-001", scope="read-write")
def test_write(ctx, must_not_run):
    pass

@declare("iq", "IQ-AREA-002", tags=["gpu"])
def test_gpu(ctx):
    pass
"""
    )
    pytester.runpytest("-p", "no:cacheprovider").assert_outcomes(skipped=2)
    found = records_by_id(evidence)
    assert found["OQ-AREA-001"]["skipReason"] == (
        "read-write test blocked in production environment production"
    )
    assert found["OQ-AREA-001"]["checks"] == []
    assert found["IQ-AREA-002"]["skipReason"] == "no GPU here"


def test_ini_options_and_merge_at_session_end(
    pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("QUALIFY_EVIDENCE_DIR", raising=False)
    pytester.makeini(
        """
[pytest]
qualify_environment = staging
qualify_evidence_dir = out/evidence
qualify_attachment_limit = 4
"""
    )
    pytester.makepyfile(
        HEADER
        + """
@declare("iq", "IQ-AREA-001")
def test_one(ctx):
    ctx.check("c", "d").that(ctx.environment).equals("staging")

@declare("iq", "IQ-AREA-002")
def test_big(ctx):
    ctx.attach("a.txt", "12345", "text/plain")
"""
    )
    result = pytester.runpytest("-p", "no:cacheprovider", "--qualify-merge")
    result.assert_outcomes(passed=1, failed=1)
    result.stdout.fnmatch_lines(
        ["*qualify merge: 2 tests, 1 pass, 0 fail, 1 error, 0 skip; verdict fail*"]
    )
    run = json.loads((pytester.path / "out/evidence/test-evidence.json").read_text())
    assert run["run"]["environment"] == "staging"
    assert run["tests"][1]["error"]["type"] == "AttachmentTooLarge"


def test_merge_at_session_end_reports_invalid_evidence(
    pytester: pytest.Pytester, evidence: Path
) -> None:
    (evidence / "records").mkdir(parents=True)
    (evidence / "records" / "junk.txt").write_text("x")
    pytester.makepyfile("def test_plain():\n    pass\n")
    result = pytester.runpytest("-p", "no:cacheprovider", "--qualify-merge")
    assert result.ret == 0
    result.stdout.fnmatch_lines(
        ["*junk.txt: not a record or marker name*", "*no run file written*"]
    )


def test_settings_that_cannot_be_used_stop_the_run(
    pytester: pytest.Pytester, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytester.makepyfile("def test_plain():\n    pass\n")
    monkeypatch.setenv("QUALIFY_ALLOW_WRITE", "OQ-AREA-001=x")
    monkeypatch.setenv("QUALIFY_NO_OVERRIDES", "1")
    result = pytester.runpytest("-p", "no:cacheprovider")
    assert result.ret == pytest.ExitCode.USAGE_ERROR
    result.stderr.fnmatch_lines(["*qualify: QUALIFY_NO_OVERRIDES refuses every override*"])
    monkeypatch.delenv("QUALIFY_NO_OVERRIDES")
    monkeypatch.setenv("QUALIFY_RUN_ID", "not-a-ulid")
    result = pytester.runpytest("-p", "no:cacheprovider")
    assert result.ret == pytest.ExitCode.USAGE_ERROR
    result.stderr.fnmatch_lines(["*QUALIFY_RUN_ID not-a-ulid is not a ULID*"])


def test_ctx_is_only_for_qualification_tests(pytester: pytest.Pytester, evidence: Path) -> None:
    pytester.makepyfile("def test_plain(ctx):\n    pass\n")
    result = pytester.runpytest("-p", "no:cacheprovider")
    result.assert_outcomes(errors=1)
    result.stdout.fnmatch_lines(["*the ctx fixture is only for qualification tests*"])


def test_secrets_are_redacted_from_the_runner_output(
    pytester: pytest.Pytester, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("QUALIFY_SECRET_TOKEN", "hidden-value-42")
    pytester.makepyfile(
        HEADER
        + """
@declare("oq", "OQ-AREA-001")
def test_leak(ctx):
    token = ctx.secret("TOKEN")
    print("printed", token)
    raise RuntimeError("failed with " + token)
"""
    )
    result = pytester.runpytest("-p", "no:cacheprovider", "-rA")
    result.assert_outcomes(failed=1)
    assert "hidden-value-42" not in result.stdout.str()
    result.stdout.fnmatch_lines(["*failed with [[]REDACTED[]]*"])
    for path in (evidence / "records").iterdir():
        assert b"hidden-value-42" not in path.read_bytes()


def test_xdist_workers_share_the_controller_run_id(
    pytester: pytest.Pytester, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("QUALIFY_RUN_ID")
    pytester.makepyfile(
        HEADER
        + "".join(
            f"""
@declare("iq", "IQ-AREA-00{n}")
def test_{n}(ctx):
    pass
"""
            for n in range(1, 5)
        )
    )
    result = pytester.runpytest_subprocess("-p", "no:cacheprovider", "-n", "2", "--qualify-merge")
    result.assert_outcomes(passed=4)
    run_ids = {name[:26] for name in markers(evidence)}
    assert len(run_ids) == 1
    assert RUN_ID not in run_ids
    assert json.loads((evidence / "test-evidence.json").read_text())["summary"]["total"] == 4
