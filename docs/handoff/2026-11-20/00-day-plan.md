# Day Plan: qualify, in Four Languages

> **Status:** Dispatched | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-003, qat-004, qat-005, qat-006, qat-007

## Goal

Ship `qualify`: a harness for qualification tests (IQ, OQ, PQ, intended use)
that records checks, writes redacted JSON evidence per test, and builds a trace
matrix from requirements to results. Four packages implement one
specification: TypeScript (`@lekman/qualify`, the reference, with the full
CLI), Python (`lekman-qualify`, a pytest plugin), Java (`com.lekman:qualify`,
a JUnit 5 extension usable from Kotlin) and C# (`Lekman.Qualify`, an xUnit v3
extension).

The work is done when all four packages pass every conformance scenario in
[spec/qualify/conformance/README.md](../../../spec/qualify/conformance/README.md)
through their real runners in CI, and each has release automation ready for its
registry. Publishing waits for the operator's registry accounts.

## Reader

A Claude Code session with no other context, working in a clone of
`lekman/qa-toolkit`. The operator owns the repository, can add secrets, approve
pull requests, and create accounts on npm, PyPI and Maven Central.

Read these first:

- [spec/qualify/README.md](../../../spec/qualify/README.md): the contract.
- [spec/qualify/evidence.schema.json](../../../spec/qualify/evidence.schema.json):
  the normative schema.
- [spec/qualify/conformance/README.md](../../../spec/qualify/conformance/README.md):
  the scenarios.
- `.claude/rules/clean-architecture.md`, `.claude/rules/markdown.md`,
  `.claude/rules/handoff.md`.
- [docs/CONTRIBUTING.md](../../CONTRIBUTING.md), in particular "No
  Client-Identifying Content".

## Decisions Already Made

Settled in planning. Do not reopen them in an implementation session; record
disagreement in Outcome instead.

| #   | Decision                                                                                                                                                                                                                                                                      | Reason                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The code is written fresh from the specification. Nothing is copied from any other codebase.                                                                                                                                                                                  | The operator's earlier private versions are not published. This repository's history must show its own origin.                                                                                                         |
| D2  | Scope is the harness and the evidence only. No cloud service harnesses, no test-management export formats.                                                                                                                                                                    | Those are vendor-specific and large. `trace.json` is the integration point.                                                                                                                                            |
| D3  | The native runner runs the tests. No custom runner, no `run` command.                                                                                                                                                                                                         | Less code, and users keep their own tooling. Selection uses each runner's filters, markers and tags.                                                                                                                   |
| D4  | Each test writes its own redacted record from the process that ran it; `merge` builds the run file.                                                                                                                                                                           | Nothing depends on an end-of-run hook, and no secret value leaves the process that knows it. Earlier designs lost evidence on both counts.                                                                             |
| D5  | Conformance runs real test files through real runners and diffs against shared expected files.                                                                                                                                                                                | Replaying stored output proves the serialiser only, and misses outcome bugs.                                                                                                                                           |
| D6  | TypeScript is the reference. It writes the expected files first; Python and Java must reproduce them.                                                                                                                                                                         | One source of truth for the expected output. Later implementations report disagreements; they never edit an expected file to fit.                                                                                      |
| D7  | The full CLI is TypeScript. Python, Java and C# ship `merge`, `validate` and `report` (the PDF). `trace` is TypeScript only.                                                                                                                                                  | Every language produces its evidence and its PDF report without Node. The Markdown trace report is written once.                                                                                                       |
| D8  | The JVM library is Java 17. Examples and docs show Kotlin and Java.                                                                                                                                                                                                           | Java users do not pull in the Kotlin runtime, and Kotlin calls Java annotations directly.                                                                                                                              |
| D9  | Names: npm `@lekman/qualify`, PyPI `lekman-qualify` with import name `qualify`, Maven `com.lekman:qualify`, NuGet `Lekman.Qualify`.                                                                                                                                           | All four were free on 2026-11-19 and 2026-11-20. `com.lekman` needs the operator to verify the `lekman.com` domain on Maven Central.                                                                                   |
| D10 | Packages live in `packages/qualify` (TypeScript), `packages/qualify-python`, `packages/qualify-jvm` and `packages/qualify-dotnet`.                                                                                                                                            | One folder of runnable tools. The Bun workspace globs `packages/*`; the non-TypeScript folders must not carry a `package.json`.                                                                                        |
| D11 | Coverage thresholds match the repository's: line 0.8, statement 0.8, function 0.6, or the language equivalent.                                                                                                                                                                | One bar across the repository.                                                                                                                                                                                         |
| D12 | The PDF report is rendered with a library native to each language: `pdf-lib` (TypeScript), `fpdf2` (Python), Apache PDFBox (Java), PDFsharp 6 (C#), with a bundled Noto Sans font.                                                                                            | No system libraries, unlike HTML-to-PDF tools that need pango and cairo. Conformance compares extracted text, not pixels, so the layouts may differ.                                                                   |
| D14 | The report's look comes from a theme file (`spec/qualify/report-theme.schema.json`): logo, fonts, colours, cover rows, header, footer and texts. Two themes ship in `spec/qualify/report/themes/`: `lekman` (default) and `plain`. Every package bundles both, byte for byte. | One theme works across all four languages and anyone can rebrand the report without code. HTML with a browser engine was considered and dropped: it needs a 150 MB Chromium download.                                  |
| D13 | C# is built with the .NET 11 SDK (latest stable, released 2026-11-10) and targets `net11.0` and `net10.0`. Tests use xUnit v3.                                                                                                                                                | .NET 11 is a short-term-support release; .NET 10 is the long-term-support line most teams run. Two targets cost one line in the project file. xUnit v3 is the most used .NET test framework and supports dynamic skip. |

## Dependency Spine

```text
qat-003 TypeScript reference + expected files ──gates──▶ qat-004 Python
                                              ├─gates──▶ qat-005 Java
                                              └─gates──▶ qat-007 C#
qat-003, qat-004, qat-005, qat-007 ──gate──▶ qat-006 release automation
```

`qat-004`, `qat-005` and `qat-007` start once `qat-003` is merged with its
expected files committed, and run in parallel. `qat-006` starts when all four
are merged.

## Ordering

| Order | Brief                                                          | Branch                    | Gate to proceed                                                            |
| ----- | -------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| 1     | [qat-003-qualify-typescript.md](qat-003-qualify-typescript.md) | `feat/qualify-typescript` | Merged; every scenario passes in CI; expected files reviewed and committed |
| 2a    | [qat-004-qualify-python.md](qat-004-qualify-python.md)         | `feat/qualify-python`     | Merged; every scenario passes in CI against the committed expected files   |
| 2b    | [qat-005-qualify-jvm.md](qat-005-qualify-jvm.md)               | `feat/qualify-jvm`        | Merged; every scenario passes in CI against the committed expected files   |
| 2c    | [qat-007-qualify-dotnet.md](qat-007-qualify-dotnet.md)         | `feat/qualify-dotnet`     | Merged; every scenario passes in CI against the committed expected files   |
| 3     | [qat-006-qualify-release.md](qat-006-qualify-release.md)       | `ci/qualify-release`      | Merged; dry runs pass for npm, PyPI, Maven Central and NuGet               |

## Handling Rules for the Day

- Conventional commits. Scope is the package: `feat(qualify): ...`,
  `feat(qualify-python): ...`, `feat(qualify-jvm): ...`, `feat(qualify-dotnet): ...`, `ci(qualify): ...`.
- No client-identifying content in files or commit messages. Examples use Acme,
  PROJ-123 and EXPORT-003. The `pre-commit` and `commit-msg` hooks and the CI
  leak guard block it; fix the text, never bypass a hook.
- A change to the specification goes in its own pull request first. An
  implementation never quietly differs from the specification.
- Each package README says what it costs (dependencies, runtime requirements,
  limits), not only what it does.
- Fill the brief's Outcome section in the same pull request as the work.
