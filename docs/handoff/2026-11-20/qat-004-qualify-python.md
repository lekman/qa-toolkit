# qat-004: qualify, Python

> **Status:** Dispatched | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-004

## Context

`lekman-qualify` brings the [qualify specification](../../../spec/qualify/README.md)
to pytest as a plugin. A Python test declares itself with a decorator and
receives a `ctx` fixture beside its ordinary fixtures. The package writes the
same record files as the TypeScript reference and ships `merge` and `validate`
commands with the same flags and exit codes.

This brief produces one pull request on branch `feat/qualify-python`. It starts
after qat-003 is merged, because it must reproduce the expected files qat-003
committed under `spec/qualify/conformance/expected/`. It runs in parallel with
qat-005.

## Already Done, Do Not Redo

- The specification, schema, scenarios and expected files exist on `main` after
  qat-003. Verify the expected files are present before starting.
- `@lekman/qualify` (TypeScript) implements the same behaviour. Read its source
  for intent when the specification leaves a detail open, but write Python
  code; do not transliterate line by line.
- CI already detects Python through `detect-language`, and runs `python-deps`,
  `python-quality` and `python-audit` when it finds a Python project. Check how
  those composites locate the project (`working-directory` input) before adding
  anything.

## Steps

1. **Scaffold** `packages/qualify-python/` with `pyproject.toml` (build backend
   `hatchling`, project name `lekman-qualify`, import package `qualify`, version
   `0.1.0`, licence MIT, `requires-python >=3.10`), the `pytest11` entry point
   `qualify = qualify.plugin`, and a console script `qualify` for `merge` and
   `validate`. Dependencies: `pytest>=8.3` and `jsonschema>=4.18`. Dev tools:
   `ruff`, `mypy` in strict mode, `pytest-cov`, `pytest-xdist`. Use `uv` for the
   lock file. Do not add a `package.json`; the Bun workspace globs
   `packages/*`.
2. **Core**: declaration validation, the context and checks with all matchers,
   outcome classification, normalisation, redaction, the environment resolver
   and policy, the run envelope and the atomic writer, matching the
   specification sections 2 to 7. `qualify.Secret` is a `str` subclass with a
   hiding `repr()` that registers its value when created. `and` is spelled
   `and_` in the decorator.
3. **Plugin**: the decorator adds markers (`qualify`, the level, each tag) and
   puts the ID in the item's keywords. Outcome comes from a
   `pytest_runtest_makereport` hook wrapper reading the call-phase report,
   never from a fixture `yield`. `pytest.skip()` in the body becomes a `skip`
   record. Parametrised qualification tests fail at collection with a clear
   message. With xdist, the controller creates the run ID and passes it to
   workers; `--qualify-merge` runs `merge` in the controller at session end.
   Prove with a test that `pytest -k OQ-CONF-001` selects by ID.
4. **CLI**: `qualify merge` and `qualify validate`, same flags and exit codes as
   the specification section 8. `trace` prints a message pointing at
   `npx @lekman/qualify trace` and exits 64.
5. **Conformance**: `packages/qualify-python/conformance/test_<scenario>.py`
   per scenario, plus a harness (`python -m qualify_conformance` or a script)
   that runs each with pytest exactly as the scenario text says, merges, masks
   and diffs against `spec/qualify/conformance/expected/`. Use xdist with two
   workers for `parallel-determinism`, and `os._exit` in a subprocess for
   `crash`. Scenarios 12 and 19 need `trace`: run the TypeScript CLI on the
   Python run file with `npx @lekman/qualify` from the workspace build, and
   compare its output too.
6. **CI**: run the Python package's lint, type check, tests and conformance in
   the quality job, using the devops-actions Python composites where they fit
   and plain steps where they do not. A difference from an expected file fails
   the job.
7. **Docs**: `packages/qualify-python/README.md` (install with pip and uv, an
   example, xdist, what it costs) and update the index tables and the practice
   to mention Python.
8. **Verify**: ruff, mypy, pytest with coverage at the repository thresholds,
   the conformance run, and the root checks. Draft pull request with the
   repository's template.

## Failure Interpretation

- If Python output differs from an expected file and the specification supports
  the Python result, the expected file is wrong: stop, report it in Outcome, and
  raise a specification pull request. Never edit an expected file in this pull
  request to make Python pass.
- Float formatting differences (`1.0` against `1`) are a normalisation bug in
  Python; the specification's JSON values are what the TypeScript reference
  writes.
- A failing conformance run on CI that passes locally usually means a leaked
  `QUALIFY_*` or `PYTEST_ADDOPTS` variable; the harness must clear them.

## Outcome

_Empty at dispatch._
