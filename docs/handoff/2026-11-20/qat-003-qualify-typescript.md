# qat-003: qualify, TypeScript Reference

> **Status:** Consumed | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-003

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

2026-11-20, implementation session. Branch `feat/qualify-typescript`, stacked
on `docs/qualify-design`. Committed locally; the coordinating session pushes
and opens the pull request, so step 9's draft pull request is not opened here.

### Result

- `packages/qualify` builds for Node 20 with entry points `.`, `./vitest`,
  `./vitest/setup`, `./node`, `./node/setup` and `./bun`, and bin `qualify`.
  The two setup entry points are additions to the brief's list: vitest's
  `globalSetup` and node's `--test-global-setup` each need a module of their
  own.
- Runtime dependencies: `ajv` 8 (2020 build) and `yaml` 2, external to the
  build, loaded by the CLI and the core entry only, never by the adapters.
- 222 unit tests, 99.75 % of lines. Coverage excludes the adapters, which the
  conformance runs exercise.
- `bun run conformance`: 34 runs pass, scenarios 21 (`report`) and 22
  (`report-theme`) included. vitest runs all 20 scenarios (21 runs,
  scenario 7 has two). `node:test` and bun run scenarios 1, 2, 6 and 10
  against the same expected files. One more check per runner proves that,
  without `QUALIFY_RUN_ID`, the runner's documented setup gives every file one
  run ID. Changing one character of an expected file fails the run.
- `spec/qualify/trace.schema.json` is written and `trace` output is validated
  against it in the unit tests and in every conformance trace.
- CI: the quality job sets up Node 22 and runs `bun run conformance` after the
  build.

### PDF Report (Step 4a)

- `qualify report` is in `src/report`: `ReportContent` (pure), `Layout` (pure,
  over a text-metrics port), `PdfRenderer` (`pdf-lib` with `@pdf-lib/fontkit`)
  and `report.system.ts`, which reads Noto Sans 2.015 regular and bold
  (1.2 MB, OFL in `fonts/OFL.txt`). Fonts are embedded as subsets; a short
  report is about 20 KB.
- **`@pdf-lib/fontkit` 1.1.1 breaks subsets of Noto Sans.** It copies glyph
  records unpadded and writes a short `loca`, which stores offset / 2; Noto
  Sans has 1323 odd-length records, so later glyphs are read from the wrong
  place. Text extraction still passed while the rendered pages, in pdfjs and
  in macOS Quartz, had most letters missing. `SubsetFix` pads each record. A
  unit test compares every subset glyph outline with the original font, and a
  second test fails once fontkit no longer needs the fix.
- Scenario 21 passes: the outline in `expected/report.outline.txt`, written by
  hand from the scenario text, is found in order; `Title`, `Subject`,
  `Keywords` and `CreationDate` match; every page has its footer; `report`
  exits 0 for the failed run. Changing one outline value or swapping two
  lines fails it.
- Runtime dependencies, installed size: `pdf-lib` 25.7 MB with its four
  dependencies, `@pdf-lib/fontkit` 4.2 MB, `ajv` 2.8 MB, `yaml` 1.3 MB; about
  34 MB in all, mostly `pdf-lib`'s several builds and source maps. The npm
  tarball is about 700 KB. Dev dependencies: `pdfjs-dist` (text extraction)
  and `@napi-rs/canvas` (page images for the README).
- The README shows the first two pages of `docs/sample-report.pdf` (21 KB),
  rendered with `scripts/render-pages.ts`.

### Report Themes

- The report follows the rewritten section 9: a cover page (logo and brand
  name, title at 40% of the page, accent rule, subtitle, metadata rows above
  the bottom margin), then pages with a header and a footer counted from the
  cover, three heading levels, tables with a filled header row repeated on
  continued pages and zebra rows, and mono IDs, digests and values.
- `src/theme` loads a theme by bundled name or path (`--theme`, then
  `QUALIFY_REPORT_THEME`), validates it against `report-theme.schema.json`,
  reads its files relative to the theme file, and checks every token. A bad
  theme exits 2 and writes no PDF.
- Both themes are bundled in `themes/` byte for byte, and a test fails on any
  difference from `spec/qualify/report/themes/`. The old `fonts/` folder is
  gone: the plain theme carries Noto Sans.
- Geist has no odd-length glyph records (short `loca`, 0 of 975 and 1159), so
  the fontkit subset fault only hits Noto Sans; the glyph-outline test runs
  over all five bundled fonts.
- Visual check, pages 1 to 3 of the sample in both themes: the cover reads as
  intended in both. Three faults were found and fixed: a SHA-256 wrapped in
  the mono font (mono is now 8.5 pt), a long title pushed the header into the
  classification (header and footer are now cut with `…`), and a test's field
  list split from its heading (a heading now keeps a field list that fits on
  a page). A 20-word title and a two-line subtitle move up and stay clear of
  the metadata rows.
- The lekman logo and name are not covered by the MIT licence; the README says
  so. `package.json` has no field where that fits.

### Specification Changes

Made in their own commits, before the implementation:

1. Record and marker names gain `__<key>`, the first 8 hex digits of the
   SHA-256 of the declaration site. As written, two declarations of one ID
   wrote the same file name, so scenario 17 could not be met.
2. `source.dirty` counts tracked files only. The evidence directory sits
   untracked in the repository, so `dirty` changed partway through a run and
   `merge` refused the disagreeing envelopes.
3. Bytes-level details every language must share: code point order for keys
   and sets, a cycle makes the whole value unserialisable, string length in
   code points, the pattern rules as regular expressions, how a JSON
   attachment is written, the `AttachmentTooLarge` message, the
   `run-context.json` shape, lower-cased target keys.
4. Merge details: dot files ignored, names checked against content, which
   file supplies `tool`, `actor` and `target`, the envelope of a run with no
   records. The `protocol.yaml` and `trace.yaml` formats, exit-code
   precedence, and the `merge` and `validate` exit codes.
5. Report text the shared outline depends on, in its own commit: the summary
   counts line, the requirement cell with its sources, outcomes as JSON values
   (`not-run`), the list headings `Not run` and
   `Requirements without a passing test`, the test heading `<ID> <title>`, `-`
   for a missing value, compact JSON without spaces, the 200-character cut in
   code points, the cover showing `run.tool` while `Producer` names the PDF
   writer, the shared `fixtures/report.protocol.yaml`, and how an outline line
   is matched inside an extracted line.
6. Themes, in their own commit: scenario 21's page 2 footer is checked on page
   2 instead of in the ordered outline, because where page 2 ends differs
   between languages; a header equal to the title may appear once on the
   cover; scenario 22 run A uses scenario 21's flags, and its outline holds
   the `Commit` label; title and classification may not use each other's
   tokens; `{levels}` is `-` for a run with no tests; an over-long header or
   footer is cut with `…`; and the signature block sits under the heading
   `Signatures`.
7. Conformance text: a fixed "one passing check", check texts for scenarios
   11 and 15, `<runtime error>` masking in scenario 10, two invocations in
   scenario 14, SIGKILL in scenario 18, titles in scenario 20, literal
   `<scenario>:0` site masking after a site check, `run.selection` removed in
   masking, trace masking, and trace expected files for scenarios 19 and 20.

### Observations and Deviations

- **The node setup cannot be an `--import` preload.** On Node 22, 24 and 26,
  `node --test` loads `--import` modules in each test file's process and not
  in the main process, so every file created its own run ID. The setup is a
  `globalSetup` for `--test-global-setup` (Node 24 or later; it takes a file
  path, so a project re-exports it). On Node 22, `--experimental-test-isolation=none`
  runs one process, which creates the ID. Without either, and without
  `QUALIFY_RUN_ID`, a test fails with that advice.
- **`process.exit` does not crash a vitest worker.** vitest 5 replaces it with
  a function that throws. The crash scenario uses
  `process.kill(process.pid, "SIGKILL")` in a forked worker.
- **Runtime skips:** vitest and `node:test` show them as skipped; bun has no
  in-body skip and shows them as passed. The record says `skip` in all three.
- **Bun's `expect()` throws a plain `Error`.** The bun adapter treats one whose
  message starts with `expect(` as an assertion (`fail`).
- **vitest fixtures from `test.extend` are not supported.** vitest refuses a
  fixture user that does not destructure fixtures by name.
- **A declaration error is registered as a failing test** under its
  `[<ID>] <title>` name, so both errors of scenario 9 are reported and the
  rest of the file still runs. No files are written for it.
- **Prettier reflows the expected JSON** and breaks the byte comparison, so a
  root `.prettierignore` excludes `spec/qualify/conformance/expected/`. Trunk
  honours it.
- `run.selection` is not recorded by the TypeScript adapters.
- Redaction registers values per process, so a value registered in one test is
  redacted in every later record of the same process.

### Open for the Coordinator

- The pull request "ci: run the devops-actions checks and a leak guard in CI"
  was still a draft when this ran. The CI change here edits the `quality` job
  of the current `ci.yml`. When that pull request lands first, the conflict
  resolves by adding only the `Conformance` step after `Build all packages`:
  its `setup-runtime` step already installs Node 22 from `mise.toml`.
- No release-please entry for `packages/qualify`; qat-006 owns it.
- The runtime dependencies are about 34 MB installed. Bundling `pdf-lib`,
  `@pdf-lib/fontkit`, `ajv` and `yaml` into `dist/` would make a cold `npx`
  far lighter, but the `bun` and `types` entry points serve `src/`, which
  imports them by name. Choosing between the two is open.
- `spec/qualify/evidence.schema.json` now allows `csharp` in `tool.language`;
  the package's copy and `ToolInfo` follow it in their own commit.
