# qat-007: qualify, C#

> **Status:** Consumed | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-007

## Context

`Lekman.Qualify` brings the [qualify specification](../../../spec/qualify/README.md)
to .NET as an xUnit v3 extension. Qualification tests use attributes
(`[IQ]`, `[OQ]`, `[PQ]`, `[IU]`) that derive from `FactAttribute`, and read
their context from `QualifyContext.Current`. The package writes the same record
files as the TypeScript reference and ships `merge`, `validate` and `report` as
a .NET tool named `qualify`.

This brief produces one pull request on branch `feat/qualify-dotnet`. It starts
after qat-003 is merged, because it must reproduce the expected files qat-003
committed under `spec/qualify/conformance/expected/`. It runs in parallel with
qat-004 and qat-005. No .NET version of this framework existed before.

## Already Done, Do Not Redo

- The specification, schema, scenarios and expected files exist on `main` after
  qat-003. Section 2.5 of the specification describes the C# declaration.
  Verify the expected files are present before starting.
- `@lekman/qualify` (TypeScript) implements the same behaviour. Read it for
  intent when the specification leaves a detail open, and write idiomatic C#.
- devops-actions has no .NET composite. A plain `actions/setup-dotnet` step is
  expected here.

## Steps

1. **Scaffold** `packages/qualify-dotnet/` with a solution file, a
   `Directory.Build.props` holding the version (`0.1.0`), `Nullable` enabled,
   `TreatWarningsAsErrors`, and `LangVersion` latest, and a `global.json`
   pinning the .NET 11 SDK with `rollForward` `latestFeature`. Projects:
   - `src/Lekman.Qualify`: the library, `TargetFrameworks` `net11.0;net10.0`,
     package ID `Lekman.Qualify`, licence expression `MIT`, README and icon
     packed. Dependencies: `xunit.v3.extensibility.core` (or the xUnit v3
     package that exposes the extensibility API), `PDFsharp` 6 for the report,
     and `JsonSchema.Net` for `validate`. Use `System.Text.Json` for JSON.
   - `src/Lekman.Qualify.Tool`: a .NET tool, command name `qualify`, for
     `merge`, `validate` and `report`. `trace` prints a pointer to
     `npx @lekman/qualify trace` and exits 64.
   - `tests/Lekman.Qualify.Tests`: unit tests with xUnit v3.
   - `conformance/Lekman.Qualify.Conformance`: one test class per scenario.
     Do not add a `package.json`; the Bun workspace globs `packages/*`.
2. **Attributes and test case**: `[IQ]`, `[OQ]`, `[PQ]` and `[IU]` derive from
   `FactAttribute` and plug in a test case of qualify's own through xUnit v3's
   extensibility points, so qualify wraps the method body itself: it writes the
   started marker, applies the policy, sets `QualifyContext.Current` (an
   `AsyncLocal`), runs the body, classifies the outcome, and writes the
   redacted record. Display name `[<ID>] <title>`; traits `Qualify` (level)
   and `Tag` (each tag). `ctx.Skip(reason)` uses xUnit v3's dynamic skip.
   Prove with tests that `dotnet test` filters select by level, by tag and by
   ID, under the Microsoft Testing Platform runner that xUnit v3 uses by
   default. Write the exact filter syntax into the README.
3. **Core**: declaration validation, checks and matchers (C# names mapped to
   the shared JSON names), outcomes, normalisation, redaction, environment and
   policy, the run envelope and the atomic writer, matching sections 2 to 7.
   Pay attention to the shared byte format: two-space indent, keys sorted by
   code point (`StringComparer.Ordinal`), integers without a decimal point,
   trailing newline. The run ID comes from `QUALIFY_RUN_ID`, or one is created
   per test run and shared by every test in it.
4. **PDF report**: `qualify report` as in section 9, rendered with PDFsharp 6
   and a bundled Noto Sans (SIL Open Font License, include its licence file),
   embedding the subset used. Pass conformance scenario 21 by extracting text
   with `PdfPig` (a dev-only dependency) and matching
   `expected/report.outline.txt` in order. Add images of the first two pages
   of a sample report to the package README.
5. **Conformance**: a harness (`dotnet run --project conformance/...` or a
   script) that runs each scenario exactly as the scenario text says, merges,
   masks and diffs against `spec/qualify/conformance/expected/`. Run
   `parallel-determinism` with xUnit's parallel execution and at least two
   threads, and `crash` with `Environment.FailFast` in a child `dotnet test`
   process so the harness survives. Scenarios 12 and 19 use the TypeScript CLI
   for `trace`.
6. **CI**: a `dotnet` job in `.github/workflows/ci.yml` with
   `actions/setup-dotnet` (pinned to a commit SHA with a version comment,
   `global-json-file`), restore, build, tests with coverage, and conformance.
   Add it to the quality gate as required.
7. **Docs**: `packages/qualify-dotnet/README.md` with install
   (`dotnet add package Lekman.Qualify`, `dotnet tool install`), an example,
   the filter syntax, the report, and what it costs (dependencies, target
   frameworks, package size). Update the index tables and the practice.
8. **Verify**: `dotnet build -warnaserror`, tests with coverage at the
   repository thresholds (line 0.8), the conformance run, `dotnet format
--verify-no-changes`, the root checks and actionlint. Draft pull request
   with the repository's template.

## Failure Interpretation

- `System.Text.Json` writes `1.0` for a `double` 1 only when asked; the
  specification's JSON values follow the TypeScript reference, which writes `1`.
  Normalise numbers before serialising.
- A `dotnet test` filter that matches nothing usually means the filter syntax
  belongs to the other runner (VSTest against the Microsoft Testing Platform).
  Check which one the test project uses.
- If the .NET output differs from an expected file and the specification
  supports the .NET result, stop and raise a specification pull request. Never
  edit an expected file here.

## Outcome

2026-11-20, implementation session, branch `feat/qualify-dotnet`, stacked on
`origin/feat/qualify-typescript` (454c8de). Committed locally; not pushed, no
pull request yet.

**Built.** `packages/qualify-dotnet/` with `Lekman.Qualify` (net11.0 and
net10.0), the `Lekman.Qualify.Tool` .NET tool (`qualify`), unit tests, the
scenario classes, a filter sample, the conformance harness and a
development-only page renderer. The SDK is pinned in the package's
`mise.toml` (11.0.100, plus 10.0.404 for the .NET 10 runtime that runs the
net10.0 tests) and `global.json` (11.0.100, `latestFeature`, and the
Microsoft Testing Platform for `dotnet test`).

**How the extension works.** The attributes derive from `FactAttribute` and
name `QualifyDiscoverer`, which validates the declaration (a declaration error
becomes an `ExecutionErrorTestCase` that fails with every problem and writes
nothing) and returns a `QualifyTestCase`. That test case implements
`ISelfExecutingXunitTestCase` and runs through qualify's own test case runner
and test runner, whose context overrides `InvokeTestMethod`: marker, policy,
`QualifyContext.Current`, the body, the outcome, the redacted record. A skip
is an exception whose message starts with xUnit's dynamic skip token.

**Evidence.** All 22 scenarios pass through the real runner in child
processes, byte for byte against the expected files, including 16 with
`--parallel collections --max-threads 2` (two threads logged) and 18 with
`Environment.FailFast`. Scenarios 12, 19 and 20 run the TypeScript CLI for
`trace`. Scenarios 21 and 22 extract text with PdfPig. `dotnet test` filters by
level, tag and ID are proven against a sample project. Unit tests: 130 per
target framework (one skips on purpose), line coverage 97.3% and branch 90.1%
of `Lekman.Qualify` (coverlet.MTP, Cobertura, threshold line 80). `bun run conformance` at the
root still passes.

**Deviations and findings.**

- The branch was rebased onto `origin/feat/qualify-typescript` at 454c8de,
  and the two layout fixes there (fills drawn before lines and text; a
  heading kept with the start of the next block) are ported, with tests.
- No specification change was needed. The display-name filter
  (`--filter-display-name "[OQ-EXPORT-003]*"`) selects by ID as section 2.5
  says.
- PDFsharp 6.2.4 and JsonSchema.Net 8.0.5 are pinned because they are the last
  MIT releases: PDFsharp 6.5.0 is AGPL-3.0-only and JsonSchema.Net 9.x uses a
  maintenance-fee EULA. `System.Security.Cryptography.Pkcs` 10.0.15 lifts
  PDFsharp's 8.0.1 dependency past its advisories. YamlDotNet (MIT) reads the
  protocol and map files.
- PDFsharp writes its own name into `Producer`
  (`PDFsharp 6.2.4 (Original: Lekman.Qualify 0.1.0)`); `Creator` holds
  `Lekman.Qualify 0.1.0`. Section 9.2 asks for the package's name and version
  only. Not covered by a scenario.
- `dotnet test` runs a test executable in its output folder, so the default
  evidence directory lands under `bin/`. The README tells users to set
  `QUALIFY_EVIDENCE_DIR`.
- The scenario classes live in
  `packages/qualify-dotnet/conformance/Lekman.Qualify.Conformance/`, not
  directly in `conformance/` as the conformance README's example path shows.
- The quality gate config the dispatch mentioned is not on this base: it is in
  pull request 9 (`ci/align-devops-actions`). The `dotnet` job is in `ci.yml`;
  adding `"dotnet"` to that gate's `required` list is left for when the two
  branches meet.
