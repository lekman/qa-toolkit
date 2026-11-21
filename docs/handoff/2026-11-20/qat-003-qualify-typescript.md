# qat-003: qualify, TypeScript Reference

> **Status:** Dispatched | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-003

## Context

`@lekman/qualify` is the reference implementation of the
[qualify specification](../../../spec/qualify/README.md): the declaration API
with adapters for vitest, `node:test` and bun, the context and checks, record
files, redaction, and the full CLI (`merge`, `validate`, `trace`). It is also
the first implementation to run the 20 conformance scenarios, and it writes the
expected files the Python and Java packages must reproduce.

This brief produces one pull request on branch `feat/qualify-typescript`. It
gates qat-004 and qat-005. The package is built and tested, not published.

## Already Done, Do Not Redo

- `spec/qualify/README.md`, `spec/qualify/evidence.schema.json` and
  `spec/qualify/conformance/README.md` exist on `main`. The schema has been
  checked with a JSON Schema 2020-12 validator: valid samples of all three file
  kinds pass, and twelve broken samples are rejected.
- CI mirrors `devops-toolkit` on the public `lekman/devops-actions` composites
  and includes a required leak guard (pull request "ci: run the devops-actions
  checks and a leak guard in CI"). Verify it is merged before relying on it.
- `packages/data-sampler` shows the repository's package conventions:
  `package.json` exports, `scripts/build.ts`, `bunfig.toml` coverage,
  `tsconfig.json`, README and CHANGELOG. Follow it.

## Steps

1. **Scaffold** `packages/qualify` the way `packages/data-sampler` is set up.
   `name` `@lekman/qualify`, version `0.1.0`, `license` MIT, `engines.node`
   `>=20`, `publishConfig.access` `public`. Subpath exports: `.` (core),
   `./vitest`, `./node`, `./bun`. `bin`: `qualify`. Runtime dependencies kept to
   what the work needs: a JSON Schema 2020-12 validator (for example `ajv` with
   its 2020 build) and a YAML parser for `protocol.yaml` and `trace.yaml`. Peer
   dependency `vitest` optional. Add the package to `packages/README.md`.
   Expected: `bun install`, `bun run typecheck` and `bun run build` pass at the
   root.
2. **Core** under `src/`, following `.claude/rules/clean-architecture.md`:
   declaration validation (section 2.1 and 4 of the spec), the context and
   checks with all matchers (section 3), outcome classification (3.3),
   normalisation and redaction (section 7), the environment resolver and policy
   (section 5), the run envelope (6.4), and an atomic file writer in a
   `*.system.ts` file. Unit tests for each, with the coverage thresholds in
   `bunfig.toml`.
3. **Adapters** for vitest, `node:test` and bun. Each registers the test under
   `[<ID>] <title>`, wraps the body, writes the started marker before the body
   and the record after it, and maps `ctx.skip` to the runner's skip where the
   runner allows it. Record in the package README which runners show a runtime
   skip as skipped and which only record it. The run ID follows section 6.2: a
   vitest global setup creates one and passes it to workers; `node:test` and bun
   take `QUALIFY_RUN_ID` or create one in the main process before tests load.
4. **CLI** with `node:util` `parseArgs`: `merge`, `validate`, `trace`, with the
   flags and exit codes in section 8. Write `spec/qualify/trace.schema.json`
   for `trace.json` (draft 2020-12, `schemaVersion` 1) in the same pull request
   and validate `trace` output against it in tests. Usage errors exit 64.
   4a. **PDF report**: `qualify report` as specified in section 9 of the specification, rendered with `pdf-lib` with `@pdf-lib/fontkit`, and `pdfjs-dist` as a dev dependency to extract text in tests. Bundle Noto Sans (SIL Open Font License, include its licence file) and embed the subset used. Pass conformance scenario 21 (`report`): the extracted text holds every line of `expected/report.outline.txt` in order, and the metadata matches. Add a sample PDF from the conformance run to the package README as an image of its first two pages.
5. **Conformance.** `packages/qualify/conformance/` holds one test file per
   scenario, written for vitest, plus a harness script
   (`bun run conformance`) that runs each scenario as the spec describes:
   fixed run ID `01HQA1ZQJ0C0NF0RMANCE00000`, a fresh temporary evidence
   directory, only the listed `QUALIFY_*` variables, then `merge`, masking and
   comparison. Run the `parallel-determinism` scenario with vitest's thread
   pool and at least two workers, and the `crash` scenario with
   `process.exit` inside a forked worker. Add a `node:test` and a bun run of
   scenarios 1, 2, 6 and 10 to prove the other adapters, compared against the
   same expected files.
6. **Expected files.** Generate `spec/qualify/conformance/expected/*.json` and
   `expected/report.outline.txt` from
   the TypeScript run, then review each one by hand against the scenario text.
   Every value the scenario names must appear as written. Commit them in this
   pull request. Note in Outcome any scenario text that was ambiguous and how it
   was read.
7. **CI.** Make sure the quality job runs `bun run conformance` for this package
   and that it fails the job on any difference. The CI workflow already loops
   over `packages/*/package.json`; add the conformance run without breaking
   that loop.
8. **Docs.** Write `packages/qualify/README.md` (install, a 20-line example per
   runner, the CLI, what it costs: dependencies, Node version, attachment limit,
   which runners show skips) and `practices/qualification-tests/README.md` (the
   problem, the pattern, the trade-offs, when not to use it), and add both to
   the index tables in `packages/README.md`, `practices/README.md` and the root
   `README.md` (change qualify's status to "TypeScript in progress" or similar,
   not "released").
9. **Verify** at the root: `bun run check`, `bun run build`, every package's
   tests, `bun run conformance`, and `trunk check` on changed files. Open the
   pull request as a draft with the repository's template.

## Failure Interpretation

- A scenario that differs only in a masked field means the masking is wrong:
  fix the harness, not the expected file.
- A runtime skip that vitest reports as passed is a runner limitation, not an
  evidence bug, if the record still says `skip`. Document it in the README.
- An `ajv` strict-mode warning about `unevaluatedProperties` or `if`/`then`
  is a validator configuration issue. The schema is valid draft 2020-12; use
  the 2020 build with strict mode set to log, not throw.
- If a scenario cannot be met as written, stop, record it in Outcome, and raise
  a specification change in its own pull request. Do not change the behaviour
  silently.

## Outcome

_Empty at dispatch._
