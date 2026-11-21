# qat-004: qualify, Python

> **Status:** Consumed | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-004

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
   4a. **PDF report**: `qualify report` as specified in section 9 of the specification, rendered with `fpdf2`, and `pypdf` as a dev dependency to extract text in tests. Bundle Noto Sans (SIL Open Font License, include its licence file) and embed the subset used. Pass conformance scenario 21 (`report`): the extracted text holds every line of `expected/report.outline.txt` in order, and the metadata matches. Add a sample PDF from the conformance run to the package README as an image of its first two pages.
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

2026-11-20, implementation session. Branch `feat/qualify-python`, stacked on
`origin/feat/qualify-typescript` (3744a8d, the themed report). Committed
locally; the coordinating session pushes and opens the pull request, so step
8's draft pull request is not opened here, and the new CI job has not run on
GitHub.

### Result

- `packages/qualify-python`: hatchling, project `lekman-qualify` 0.1.0, import
  package `qualify`, `requires-python >=3.10`, the `pytest11` entry point
  `qualify = qualify.plugin`, and the console script `qualify` (also
  `python -m qualify`). No `package.json`; `bun install --frozen-lockfile` and
  `bun run check` at the root pass with the folder present. `uv.lock` resolves
  from pypi.org only.
- Runtime dependencies: `pytest>=8.3`, `jsonschema>=4.18`, `fpdf2>=2.8.3` and
  `pyyaml>=6.0.1`, about 31 MB installed beyond pytest, 28 MB of it fpdf2 with
  fontTools and Pillow. The plugin imports none of the report's dependencies.
  Dev: ruff pinned to 0.17.6 (the version Trunk runs), mypy, pytest-cov,
  pytest-xdist, pypdf (text extraction), pypdfium2 (page images),
  types-jsonschema, types-pyyaml.
- 208 unit tests, 98.3 % of lines, mypy strict on `src`, `tests`,
  `conformance` and `scripts`. The plugin is tested in-process with
  `pytester`; the outer session runs with `-p no:qualify`, because an
  entry-point plugin loads before pytest-cov starts and its module lines would
  count as missed.
- Checked on Python 3.13 and 3.10, and on 3.10 with the lowest declared
  versions (pytest 8.3.5, jsonschema 4.18.0, fpdf2 2.8.3, PyYAML 6.0.1).
- Conformance, `uv run python conformance/run.py`: all 24 runs pass. Every
  numbered scenario runs as a real pytest file through the real plugin, is
  merged with this package's `qualify merge`, masked, and compared byte for
  byte with the expected file. Scenarios 12, 19 and 20 run
  `node packages/qualify/dist/cli.js trace` on the Python run file and match
  their `.trace.json` files. Scenario 16 runs on two xdist workers, twice.
  Scenario 18 ends the pytest process with `os._exit`. Scenarios 21 and 22
  extract the PDF text with pypdf and match both outlines in order, plus the
  metadata, footers, header, bad theme and flags. Three runs beyond the
  numbered scenarios: xdist workers share the controller's run ID, and
  `--qualify-merge` merges at session end.

### How the Plugin Gets Outcomes and Run IDs

- Outcome: a `pytest_runtest_makereport` wrapper reads the exception of the
  phase that ended the test: `call`, or `setup` for a fixture error or a skip
  marker. A `pytest_pyfunc_call` wrapper raises `CheckFailed` after a body that
  completed with a failed soft check, or with a hard check whose
  `CheckFailed` the body caught. A setup wrapper writes the started marker
  before any other plugin's setup; a separate plain `tryfirst` hook raises the
  policy skip, because a wrapper that raises before it yields stops the
  logging plugin's wrapper from setting up and its teardown then fails.
- Run ID: the controller (or a run without xdist) takes `QUALIFY_RUN_ID` or
  creates a ULID in `pytest_configure`, and a `pytest_configure_node` hook,
  registered only when xdist is present, hands it to each worker in
  `workerinput`.
- Declaration errors and parametrised qualification tests become one
  collection error each (a `Collector` whose `collect()` raises), so pytest
  exits 2, "Interrupted", and writes nothing. vitest exits 1 for the same
  scenarios; the conformance text asks only for a runner failure.

### Visual Check of the Report

Pages 1 to 3 of both themes, rendered with pypdfium2, compared with
`packages/qualify/docs/report-*-page-*.png`: the cover, header, footer,
headings, tables, zebra rows and mono values match the reference, and every
glyph draws. Two faults were found in the layout this package ports, and are
fixed here only:

1. A striped row's fill covered half of the hairline under the row above it,
   so every second rule was fainter (visible in the plain theme's tables).
   Fills are now drawn before lines and text.
2. A heading could end a page alone: `Signatures` sat at the foot of page 4
   with its block on page 5, in both languages. A heading now stays with a
   table's header and first row, and with the first three signature roles.

The TypeScript reference has both faults. Neither changes the text or its
order, so no expected file or outline changes. A test of embedded glyph
outlines, like the TypeScript one, was not written: fpdf2 subsets with
fontTools, and the rendered pages are the check.

### Deviations and Notes

- `pytest.xfail()` in a body is recorded as `skip` with reason `xfail: <msg>`;
  an `xfail` marker does not change the record. `pytest.fail()` is `fail`.
  A setup error is `error`; a teardown error does not change the record.
- `ctx.skip` is `pytest.skip`, so pytest reports the test as skipped.
- `delegate` runs synchronous functions only.
- Python-specific normalisation: `Decimal`, `UUID` and paths become strings, an
  `Enum` its value, a dataclass a map, a naive `datetime` UTC.
- `timeout_ms` becomes a `pytest.mark.timeout` marker, which needs
  pytest-timeout.
- The ini options `qualify_*` mirror the variables; `qualify_evidence_dir` is
  relative to the rootdir.
- The CI job uses detect-language, setup-runtime, python-deps and
  python-quality at bf452e6 through their `working-directory` input, plus plain
  steps for `ruff format --check`, the TypeScript build and the conformance
  harness. It is a new `python` job beside the existing ones, so it carries
  over to the rewritten `ci.yml` of `ci/align-devops-actions` as one block.
  `eslint.config.mjs` now ignores `.venv/`, which carries third-party
  JavaScript and failed the root lint.
- The wheel carries the fonts' `OFL.txt` files as licence files but not the
  repository's MIT `LICENSE`; that is release work (qat-006).

### Specification Changes

None. No expected file or specification text disagreed with the Python result.
