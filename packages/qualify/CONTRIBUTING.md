# Contributing to qualify

How the package is put together. Consumer documentation is in
[README.md](README.md), the contract in
[spec/qualify/README.md](../../spec/qualify/README.md), and the repo-wide
rules in [docs/CONTRIBUTING.md](../../docs/CONTRIBUTING.md).

## Layout

One folder per domain, following
[.claude/rules/clean-architecture.md](../../.claude/rules/clean-architecture.md).

| Folder            | Holds                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `src/declaration` | `Declarations.validate`: fields, IDs and levels, sections 2.1 and 4.                         |
| `src/checks`      | `TestContext`, the matchers, `CheckFailed`, `SkipSignal` and the other errors.               |
| `src/outcome`     | `Outcomes.classify`: pass, fail, error or skip, section 3.3.                                 |
| `src/values`      | Normalisation (7.1) and `JsonText`, the writer every evidence file goes through.             |
| `src/redaction`   | Registered values, pattern rules, JSON keys and bytes, section 7.2.                          |
| `src/settings`    | `SettingsResolver` (variables and options) and `Policy` (write protection, rules).           |
| `src/envelope`    | `Envelope`: source, actor and target. `envelope.system.ts` runs git.                         |
| `src/evidence`    | File names, key order, types. `evidence.system.ts` writes files atomically.                  |
| `src/execution`   | `Execution`, the one test lifecycle every adapter shares, and `Runtime`, per process.        |
| `src/merge`       | `Merge.build`: records and markers to a run file, section 6.5.                               |
| `src/trace`       | `TraceInputs`, `Trace.build` and `TraceMarkdown`, section 8.                                 |
| `src/report`      | The PDF report: `ReportContent` (pure), `Layout` (pure, over `ITextMetrics`), `PdfRenderer`. |
| `src/schema`      | Copies of the two schemas in `spec/qualify/`, and the ajv validator.                         |
| `src/cli`         | `Commands` (covered) and `cli.ts` (wiring only, not covered).                                |
| `src/adapters`    | vitest, `node:test` and bun glue, and their setup modules. Covered by conformance runs.      |
| `conformance/`    | The scenario test files per runner, fixtures, and the harness `run.ts`.                      |
| `tests/`          | Unit tests, mirroring `src/`, with in-memory mocks in `tests/mocks/`.                        |

An adapter only registers the test under `[<ID>] <title>` and maps the result
back to its runner. Everything else, from the started marker to the redacted
record, happens in `Execution.run`, so the three runners cannot drift apart.

## Tests

```bash
bun test                    # unit tests with coverage (tests/ only)
bun run conformance         # build, then every scenario through every runner
```

Coverage thresholds are in `bunfig.toml` (line 0.8, function 0.6, statement
0.8). Barrels, `*.system.ts`, `cli.ts` and the adapters are excluded; the
adapters are exercised by the conformance runs instead.

`tests/schema/schema.test.ts` fails when `src/schema/*.json` differs from
`spec/qualify/` by a byte, or when the key order in `src/evidence/shapes.ts`
or `src/trace/shapes.ts` differs from the order of the schema's properties.
After a schema change, copy the file and adjust the shape.

## Conformance

`conformance/run.ts` runs each scenario in
[spec/qualify/conformance/README.md](../../spec/qualify/conformance/README.md):
a fresh evidence directory, the fixed run ID, only the scenario's `QUALIFY_*`
variables, the real runner, then `merge` and `trace` from `dist/cli.js`. It
checks the runner's and the CLI's exit codes, validates every file, checks
that every site points into the scenario's own test file, masks the run file,
and compares it byte for byte with `spec/qualify/conformance/expected/`.

vitest runs all 20 scenarios; `node:test` and bun run 1, 2, 6 and 10 against
the same expected files. The parallel scenario runs vitest's thread pool with
two workers and fails unless a worker log shows at least two. A last check
runs each runner without `QUALIFY_RUN_ID` and fails unless every file shares
the run ID the runner's setup created.

```bash
bun run conformance/run.ts --only crash,all-pass   # some scenarios
bun run conformance/run.ts --update                # rewrite the expected files
```

`--update` is for a deliberate change only. Review every changed value against
the scenario text before committing; the Python and Java packages must
reproduce these files and may not edit them.

Test sources that need a secret-shaped value (a PEM block, a JWT, an access
key ID) build it from two parts at runtime, so secret scanners do not flag the
source.

## The PDF Report

`ReportContent` decides what the report says, `Layout` places it on A4 pages
through the `ITextMetrics` port, and `PdfRenderer` draws it with `pdf-lib`.
Only `report.system.ts` reads files: the fonts in `fonts/`.

Text extraction alone does not prove a PDF renders: a broken font subset
still extracts the right text. After a change to the renderer or the fonts,
look at the pages:

```bash
bun run conformance/run.ts --only report --sample docs
bun run scripts/render-pages.ts docs/report.pdf docs 2
mv docs/report.pdf docs/sample-report.pdf
```

`scripts/render-pages.ts` uses `pdfjs-dist` and `@napi-rs/canvas`, both dev
dependencies. The PNGs in `docs/` are the README images.

## Build

```bash
bun run build      # dist/index.js, cli.js, the adapters and dist/chunks/
```

`scripts/build.ts` bundles `src/` with code splitting and keeps every package
import external: `ajv`, `yaml`, `pdf-lib` and `@pdf-lib/fontkit` are runtime
dependencies, `vitest` is the consumer's copy, and `bun:test` exists only
under Bun. The fonts stay files in `fonts/`, read at runtime. The `bun` and
`types` export conditions point at `src/`, as in the other packages.
