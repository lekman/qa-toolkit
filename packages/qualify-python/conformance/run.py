"""Conformance harness for the Python package.

Runs every scenario of spec/qualify/conformance/README.md as real pytest files
through the real plugin, merges with this package's own ``qualify merge``,
masks the run file and compares it byte for byte with the shared expected
file. The trace scenarios run the TypeScript CLI on the Python run file, so
the workspace must be built first (``bun run build`` at the repository root).

    uv run python conformance/run.py                  every scenario
    uv run python conformance/run.py --only crash,all-pass

Never writes an expected file: they belong to the TypeScript reference.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from typing import Any

from qualify import schema
from qualify.jsontext import EVIDENCE_SHAPE, TRACE_SHAPE, document

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
REPO = PKG.parent.parent
EXPECTED = REPO / "spec/qualify/conformance/expected"
FIXTURES = HERE / "fixtures"
TS_CLI = REPO / "packages/qualify/dist/cli.js"
RUN_ID = "01HQA1ZQJ0C0NF0RMANCE00000"
# Built from two parts, like the scenario's other secret-shaped values.
SECRET = "s3cr3t-" + "value-123"


class Failure(Exception):
    """A scenario did not hold."""


def check(condition: object, message: str) -> None:
    if not condition:
        raise Failure(message)


@dataclass
class Exec:
    status: int
    output: str


def run(command: Sequence[str], env: dict[str, str], cwd: Path = HERE) -> Exec:
    result = subprocess.run(
        list(command), cwd=cwd, env=env, capture_output=True, text=True, check=False
    )
    return Exec(result.returncode, result.stdout + result.stderr)


def scenario_env(directory: Path, extra: dict[str, str] | None = None) -> dict[str, str]:
    """The real environment without any QUALIFY_* or PYTEST_* variable, plus the scenario's own."""
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith(("QUALIFY_", "PYTEST_")) and k != "PYTHONPATH"
    }
    env.update(QUALIFY_RUN_ID=RUN_ID, QUALIFY_EVIDENCE_DIR=str(directory))
    env.update(extra or {})
    return env


@dataclass
class Invocation:
    files: list[str]
    status: int | None
    """pytest's expected exit code; ``None`` for any non-zero code (a crashed process)."""
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)


def pytest_run(invocation: Invocation, directory: Path) -> Exec:
    files = [f"test_{name.replace('-', '_')}.py" for name in invocation.files]
    return run(
        [sys.executable, "-m", "pytest", "-v", *invocation.args, *files],
        scenario_env(directory, invocation.env),
    )


def qualify(*args: str, env: dict[str, str] | None = None) -> Exec:
    return run([sys.executable, "-m", "qualify", *args], env or scenario_env(Path()))


def trace_cli(*args: str) -> Exec:
    if not TS_CLI.is_file():
        raise Failure(f"{TS_CLI.relative_to(REPO)} is missing: run bun run build at the root")
    return run(["node", str(TS_CLI), "trace", *args], scenario_env(Path()))


def records(directory: Path) -> list[Path]:
    folder = directory / "records"
    return (
        sorted(p for p in folder.iterdir() if not p.name.startswith(".")) if folder.is_dir() else []
    )


def files_below(directory: Path) -> Iterator[Path]:
    return (p for p in directory.rglob("*") if p.is_file())


_SITE = re.compile(r"^packages/qualify-python/conformance/test_([a-z_]+)\.py:\d+$")


def check_sites(file: dict[str, Any], scenarios: Sequence[str]) -> None:
    """Every site must point into one of the scenario's own test files."""
    allowed = {s.replace("-", "_") for s in scenarios}
    for test in file["tests"]:
        sites = [test["site"], *(c["site"] for c in test["checks"])]
        if test.get("error") and test["error"]["site"] is not None:
            sites.append(test["error"]["site"])
        for site in sites:
            match = _SITE.match(site)
            check(
                match and match[1] in allowed, f"site {site} does not point into {sorted(allowed)}"
            )


_UNSERIALISABLE = re.compile(r"\[unserialisable: [^\]]*\]")


def _mask_strings(value: Any) -> Any:
    if isinstance(value, str):
        return _UNSERIALISABLE.sub("[unserialisable: <type>]", value)
    if isinstance(value, list):
        return [_mask_strings(v) for v in value]
    if isinstance(value, dict):
        return {k: _mask_strings(v) for k, v in value.items()}
    return value


def _mask_site(site: str | None) -> str | None:
    return None if site is None else "<scenario>:0"


def mask(file: dict[str, Any], error_type: str | None = None) -> dict[str, Any]:
    """The masking table of spec/qualify/conformance/README.md."""
    copy: dict[str, Any] = json.loads(json.dumps(file))
    run_info = copy["run"]
    run_info["startedAt"] = run_info["endedAt"] = "<timestamp>"
    run_info["tool"] = {
        "name": "<tool>",
        "version": "<version>",
        "language": "<language>",
        "runtime": "<runtime>",
    }
    run_info["source"] = {"commit": None, "branch": None, "dirty": None}
    run_info["actor"] = {"name": None, "ci": None, "ciRunUrl": None}
    run_info.pop("selection", None)
    tests = []
    for test in copy["tests"]:
        test["startedAt"] = test["endedAt"] = "<timestamp>"
        test["durationMs"] = 0
        test["site"] = _mask_site(test["site"])
        for c in test["checks"]:
            c["site"] = _mask_site(c["site"])
            c.pop("at", None)
            if "delegate" in c:
                c["delegate"] = "<function>"
        if "error" in test:
            test["error"]["site"] = _mask_site(test["error"]["site"])
            if error_type is not None:
                test["error"]["type"] = error_type
        tests.append(_mask_strings(test))
    copy["tests"] = tests
    return copy


def mask_trace(trace: dict[str, Any]) -> dict[str, Any]:
    copy: dict[str, Any] = json.loads(json.dumps(trace))
    for item in copy["inputs"]:
        item["path"] = Path(item["path"]).name
        item["sha256"] = "<sha256>"
    for item in copy["runs"]:
        item["commit"] = None
    return copy


def compare(name: str, text: str) -> None:
    expected_path = EXPECTED / name
    check(expected_path.is_file(), f"expected file {name} is missing")
    expected = expected_path.read_text("utf-8")
    if expected == text:
        return
    a, b = expected.split("\n"), text.split("\n")
    line = next(i for i in range(max(len(a), len(b))) if i >= len(a) or i >= len(b) or a[i] != b[i])
    raise Failure(
        f"{name} differs at line {line + 1}:\n"
        f"  expected: {a[line] if line < len(a) else '<end>'}\n"
        f"  actual:   {b[line] if line < len(b) else '<end>'}"
    )


def read_run(directory: Path) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((directory / "test-evidence.json").read_text("utf-8"))
    return data


def test_by_id(file: dict[str, Any] | None, test_id: str) -> dict[str, Any]:
    tests: list[dict[str, Any]] = (file or {}).get("tests", [])
    found = next((t for t in tests if t["id"] == test_id), None)
    if found is None:
        raise Failure(f"no record for {test_id}")
    return found


@dataclass
class Context:
    directory: Path
    output: str
    merged: dict[str, Any] | None


@dataclass
class Scenario:
    name: str
    invocations: list[Invocation]
    merge: int | None
    """``merge``'s exit code; ``None`` when merge does not run."""
    expected: str | None = None
    error_type: str | None = None
    trace: int | None = None
    """``trace``'s exit code without a protocol, from the exit-code table."""
    sites: list[str] | None = None
    extra: Callable[[Context], None] | None = None


@contextmanager
def evidence_dir(name: str) -> Iterator[Path]:
    path = Path(tempfile.mkdtemp(prefix=f"qualify-py-{name}-"))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def trace_with(
    directory: Path, args: Sequence[str], expected_name: str
) -> tuple[int, dict[str, Any]]:
    out = directory / "trace.json"
    result = trace_cli(
        str(directory / "test-evidence.json"),
        *args,
        "--json",
        str(out),
        "--md",
        str(directory / "trace.md"),
    )
    check(out.is_file(), f"trace wrote no trace.json: {result.output}")
    trace: dict[str, Any] = json.loads(out.read_text("utf-8"))
    problems = schema.trace(trace)
    check(not problems, f"trace.json is not valid: {'; '.join(problems)}")
    compare(expected_name, document(mask_trace(trace), TRACE_SHAPE))
    return result.status, trace


def run_scenario(scenario: Scenario) -> None:
    with evidence_dir(scenario.name) as directory:
        output = ""
        for invocation in scenario.invocations:
            result = pytest_run(invocation, directory)
            output += result.output
            ok = (
                result.status != 0
                if invocation.status is None
                else result.status == invocation.status
            )
            want = "non-zero" if invocation.status is None else invocation.status
            check(ok, f"pytest exited {result.status}, expected {want}\n{result.output[-3000:]}")
        for path in records(directory):
            valid = qualify("validate", str(path))
            check(valid.status == 0, f"{path.name} is not valid: {valid.output}")
        merged = None
        if scenario.merge is not None:
            result = qualify("merge", "--evidence-dir", str(directory))
            output += result.output
            check(
                result.status == scenario.merge,
                f"merge exited {result.status}, expected {scenario.merge}\n{result.output}",
            )
            if (directory / "test-evidence.json").is_file():
                merged = read_run(directory)
                valid = qualify("validate", str(directory / "test-evidence.json"))
                check(valid.status == 0, f"the run file is not valid: {valid.output}")
                check_sites(
                    merged, scenario.sites or [f for i in scenario.invocations for f in i.files]
                )
        if scenario.trace is not None:
            result = trace_cli(
                str(directory / "test-evidence.json"), "--json", str(directory / "exit.trace.json")
            )
            check(
                result.status == scenario.trace,
                f"trace exited {result.status}, expected {scenario.trace}\n{result.output}",
            )
        if scenario.extra is not None:
            scenario.extra(Context(directory, output, merged))
        if scenario.expected is not None:
            check(merged is not None, "merge wrote no run file")
            assert merged is not None
            compare(
                f"{scenario.expected}.json",
                document(mask(merged, scenario.error_type), EVIDENCE_SHAPE),
            )


# Scenario-specific checks --------------------------------------------------------


def error_type_is(test_id: str, name: str) -> Callable[[Context], None]:
    def extra(ctx: Context) -> None:
        actual = test_by_id(ctx.merged, test_id).get("error", {}).get("type")
        check(actual == name, f"error.type is {actual}, not {name}")

    return extra


def reported_skipped(ctx: Context) -> None:
    check(re.search(r"\b1 skipped\b", ctx.output), "pytest did not report the test as skipped")


def declaration_errors(expectations: list[tuple[str, str]]) -> Callable[[Context], None]:
    def extra(ctx: Context) -> None:
        check(not records(ctx.directory), "a declaration error wrote files to records/")
        lines = ctx.output.splitlines()
        for test_id, word in expectations:
            check(
                any(test_id in line and word in line for line in lines),
                f'the pytest output does not name {test_id} with "{word}"',
            )

    return extra


def secret_redaction(ctx: Context) -> None:
    for path in files_below(ctx.directory):
        check(SECRET.encode() not in path.read_bytes(), f"{path.name} holds the secret")
    test = test_by_id(ctx.merged, "OQ-CONF-011")
    attachments = {a["filename"]: base64.b64decode(a["content"]) for a in test["attachments"]}
    check(
        json.loads(attachments["request.json"])
        == {"note": "x [REDACTED]", "token": "[REDACTED]", "url": "/x"},
        "request.json does not decode to the redacted document",
    )
    check(
        attachments["raw.bin"] == b"\x00\xff[REDACTED]\x00",
        "raw.bin does not decode to 0x00 0xFF [REDACTED] 0x00",
    )
    check(test["error"]["message"] == "failed with [REDACTED]", "the error message is not redacted")
    check(test["error"]["type"] == "RuntimeError", "error.type is not RuntimeError")


def pattern_redaction(ctx: Context) -> None:
    shapes = [
        "AK" + "IA" + "ABCDEFGHIJKLMNOP",
        "eyJhbGciOiJIUzI1NiJ9" + ".eyJ",
        "BEGIN PRIVATE" + " KEY",
    ]
    for path in files_below(ctx.directory):
        text = path.read_text("utf-8")
        for shape in shapes:
            check(shape not in text, f"{path.name} holds a secret shape")


def several_requirements(ctx: Context) -> None:
    test = test_by_id(ctx.merged, "OQ-CONF-013")
    check(test["requirements"] == ["REQ-1", "REQ-2"], "the record holds other requirements")
    status, trace = trace_with(
        ctx.directory,
        ["--map", str(FIXTURES / "several-requirements.trace.yaml")],
        "several-requirements.trace.json",
    )
    check(status == 0, f"trace exited {status}, expected 0")
    rows = [(r["requirement"], r["sources"]) for r in trace["rows"] if r["testId"] == "OQ-CONF-013"]
    check(
        rows == [("REQ-1", ["code"]), ("REQ-2", ["code"]), ("REQ-3", ["map"])],
        "the trace rows of OQ-CONF-013 are not code, code and map",
    )


def narrative(ctx: Context) -> None:
    test = test_by_id(ctx.merged, "PQ-CONF-014")
    check(test["given"] == "données d’entrée — 入力", "given changed")
    check(test["when"] == "the run 🚀 starts", "when changed")
    check(test["then"] == "“quoted” output", "then changed")
    check(test["and"] == ["first", "second", "third — 3"], "and changed")


def attachments(ctx: Context) -> None:
    passed = test_by_id(ctx.merged, "OQ-CONF-015")
    found = {a["filename"]: a for a in passed["attachments"]}
    note, blob = found.get("note.txt"), found.get("blob.bin")
    check(
        note
        and note["sizeBytes"] == 6
        and note["sha256"] == hashlib.sha256(b"hello\n").hexdigest(),
        "note.txt size or digest is wrong",
    )
    check(
        blob
        and blob["sizeBytes"] == 256
        and blob["sha256"] == hashlib.sha256(bytes(range(256))).hexdigest(),
        "blob.bin size or digest is wrong",
    )
    big = test_by_id(ctx.merged, "OQ-CONF-016")
    check(
        big["outcome"] == "error" and big["error"]["type"] == "AttachmentTooLarge",
        "OQ-CONF-016 is not AttachmentTooLarge",
    )
    check(big["attachments"] == [], "OQ-CONF-016 recorded an attachment")


def duplicate_id(ctx: Context) -> None:
    check("OQ-CONF-018" in ctx.output, "merge did not name OQ-CONF-018")
    check(not (ctx.directory / "test-evidence.json").exists(), "merge wrote a run file")


def crash(ctx: Context) -> None:
    test = test_by_id(ctx.merged, "OQ-CONF-019")
    check(test["error"]["type"] == "DidNotFinish", "the crash is not DidNotFinish")


def deselected(ctx: Context) -> None:
    check(ctx.merged is not None and len(ctx.merged["tests"]) == 1, "more than one record")
    status, trace = trace_with(
        ctx.directory,
        ["--protocol", str(FIXTURES / "deselected.protocol.yaml")],
        "deselected.trace.json",
    )
    check(status == 3, f"trace exited {status}, expected 3")
    check(trace["notRun"] == ["OQ-CONF-021"], "OQ-CONF-021 is not listed as not run")


def control_pair(ctx: Context) -> None:
    check(
        test_by_id(ctx.merged, "OQ-CONF-023").get("controls") == "OQ-CONF-022",
        "OQ-CONF-023 has no controls",
    )
    _, trace = trace_with(ctx.directory, [], "control-pair.trace.json")
    ids = [r["testId"] for r in trace["rows"]]
    at = ids.index("OQ-CONF-022") if "OQ-CONF-022" in ids else -1
    check(at >= 0 and ids[at + 1 : at + 2] == ["OQ-CONF-023"], "the pair is not on adjacent rows")


SCENARIOS = [
    Scenario("all-pass", [Invocation(["all-pass"], 0)], 0, "all-pass", trace=0),
    Scenario(
        "failing-check-stops",
        [Invocation(["failing-check-stops"], 1)],
        1,
        "failing-check-stops",
        trace=1,
    ),
    Scenario("soft-check", [Invocation(["soft-check"], 1)], 1, "soft-check"),
    Scenario(
        "thrown-error",
        [Invocation(["thrown-error"], 1)],
        1,
        "thrown-error",
        error_type="<runtime error>",
        extra=error_type_is("OQ-CONF-004", "RuntimeError"),
    ),
    Scenario(
        "plain-assertion",
        [Invocation(["plain-assertion"], 1)],
        1,
        "plain-assertion",
        error_type="<assertion error>",
        extra=error_type_is("OQ-CONF-005", "AssertionError"),
    ),
    Scenario(
        "runtime-skip",
        [Invocation(["runtime-skip"], 0)],
        0,
        "runtime-skip",
        trace=0,
        extra=reported_skipped,
    ),
    Scenario(
        "policy-skip.a",
        [Invocation(["policy-skip"], 0, env={"QUALIFY_ENVIRONMENT": "production"})],
        0,
        "policy-skip.a",
        extra=reported_skipped,
    ),
    Scenario(
        "policy-skip.b",
        [
            Invocation(
                ["policy-skip"],
                0,
                env={
                    "QUALIFY_ENVIRONMENT": "production",
                    "QUALIFY_ALLOW_WRITE": "OQ-CONF-007=conformance override",
                },
            )
        ],
        0,
        "policy-skip.b",
    ),
    Scenario(
        "missing-scope",
        [Invocation(["missing-scope"], 2)],
        None,
        extra=declaration_errors([("OQ-CONF-008", "scope")]),
    ),
    Scenario(
        "bad-id",
        [Invocation(["bad-id"], 2)],
        None,
        extra=declaration_errors([("OQ-conf-009", "pattern"), ("IQ-CONF-010", "level")]),
    ),
    Scenario(
        "secret-redaction",
        [Invocation(["secret-redaction"], 1, env={"QUALIFY_SECRET_CONFORMANCE_TOKEN": SECRET})],
        1,
        "secret-redaction",
        error_type="<runtime error>",
        extra=secret_redaction,
    ),
    Scenario(
        "pattern-redaction",
        [Invocation(["pattern-redaction"], 0)],
        0,
        "pattern-redaction",
        extra=pattern_redaction,
    ),
    Scenario(
        "several-requirements",
        [Invocation(["several-requirements"], 0)],
        0,
        "several-requirements",
        extra=several_requirements,
    ),
    Scenario("narrative", [Invocation(["narrative"], 0)], 0, "narrative", extra=narrative),
    Scenario(
        "attachments",
        [
            Invocation(["attachments"], 0, ["-k", "OQ-CONF-015"]),
            Invocation(
                ["attachments"], 1, ["-k", "OQ-CONF-016"], {"QUALIFY_ATTACHMENT_LIMIT": "16"}
            ),
        ],
        1,
        "attachments",
        extra=attachments,
    ),
    Scenario(
        "value-normalisation", [Invocation(["value-normalisation"], 0)], 0, "value-normalisation"
    ),
    Scenario(
        "duplicate-id",
        [Invocation(["duplicate-id-a", "duplicate-id-b"], 0)],
        2,
        sites=["duplicate-id-a", "duplicate-id-b"],
        extra=duplicate_id,
    ),
    Scenario("crash", [Invocation(["crash"], None)], 1, "crash", trace=1, extra=crash),
    Scenario(
        "deselected",
        [Invocation(["deselected"], 0, ["-k", "OQ-CONF-020"])],
        0,
        "deselected",
        extra=deselected,
    ),
    Scenario(
        "control-pair", [Invocation(["control-pair"], 0)], 0, "control-pair", extra=control_pair
    ),
]

PARALLEL = ["all-pass", "failing-check-stops", "narrative"]


def run_parallel() -> None:
    """Scenario 16: scenarios 1, 2 and 13 together, twice, on two xdist workers."""
    documents = []
    for _ in range(2):
        with evidence_dir("parallel") as directory:
            result = pytest_run(Invocation(PARALLEL, 1, ["-n", "2"]), directory)
            check(
                result.status == 1,
                f"pytest exited {result.status}, expected 1\n{result.output[-3000:]}",
            )
            workers = set(re.findall(r"\[(gw\d+)\]", result.output))
            check(len(workers) >= 2, f"ran on {len(workers)} worker, expected at least 2")
            merge = qualify("merge", "--evidence-dir", str(directory))
            check(merge.status == 1, f"merge exited {merge.status}, expected 1")
            merged = read_run(directory)
            check_sites(merged, PARALLEL)
            documents.append(document(mask(merged), EVIDENCE_SHAPE))
    check(documents[0] == documents[1], "the two parallel runs differ")
    compare("parallel-determinism.json", documents[0])


def run_shared_run_id() -> None:
    """Not a numbered scenario: without QUALIFY_RUN_ID, the xdist controller
    creates one run ID and every worker writes under it."""
    with evidence_dir("run-id") as directory:
        env = scenario_env(directory)
        del env["QUALIFY_RUN_ID"]
        result = run(
            [
                sys.executable,
                "-m",
                "pytest",
                "-v",
                "-n",
                "2",
                "test_all_pass.py",
                "test_runtime_skip.py",
            ],
            env,
        )
        check(result.status == 0, f"pytest exited {result.status}\n{result.output[-3000:]}")
        workers = set(re.findall(r"\[(gw\d+)\]", result.output))
        check(len(workers) >= 2, f"ran on {len(workers)} worker, expected at least 2")
        names = [p.name for p in records(directory)]
        check(len(names) == 4, f"expected 2 markers and 2 records, found {len(names)}")
        ids = {n[:26] for n in names}
        check(len(ids) == 1 and RUN_ID not in ids, f"the files used {len(ids)} run IDs")


def run_merge_option() -> None:
    """Not a numbered scenario: --qualify-merge makes the controller merge at session end."""
    with evidence_dir("merge-option") as directory:
        result = pytest_run(
            Invocation(["all-pass", "runtime-skip"], 0, ["-n", "2", "--qualify-merge"]), directory
        )
        check(result.status == 0, f"pytest exited {result.status}\n{result.output[-3000:]}")
        check("qualify merge: 2 tests" in result.output, "the session did not report the merge")
        check(read_run(directory)["summary"]["total"] == 2, "the run file does not hold both tests")


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else None)
    parser.add_argument("--only", help="comma-separated scenario names")
    options = parser.parse_args(argv)
    only = set(options.only.split(",")) if options.only else None

    jobs: list[tuple[str, Callable[[], None]]] = [
        (s.name, partial(run_scenario, s)) for s in SCENARIOS
    ]
    jobs += [
        ("parallel-determinism", run_parallel),
        ("shared-run-id", run_shared_run_id),
        ("merge-option", run_merge_option),
    ]
    results: list[tuple[str, str | None]] = []
    for name, job in jobs:
        if only is not None and re.sub(r"\.[ab]$", "", name) not in only:
            continue
        try:
            job()
            results.append((name, None))
        except Failure as failure:
            results.append((name, str(failure)))
        except Exception as error:
            results.append((name, f"{type(error).__name__}: {error}"))
        status = "pass" if results[-1][1] is None else "FAIL"
        print(f"{status}  {name}", flush=True)
        if results[-1][1] is not None:
            print("      " + str(results[-1][1]).replace("\n", "\n      "), flush=True)
    failed = sum(1 for _, error in results if error is not None)
    print(f"\n{len(results) - failed} passed, {failed} failed")
    return 0 if failed == 0 and results else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
