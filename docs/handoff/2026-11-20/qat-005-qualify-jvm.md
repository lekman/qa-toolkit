# qat-005: qualify, Java and Kotlin

> **Status:** Consumed | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-005

## Context

`com.lekman:qualify` brings the [qualify specification](../../../spec/qualify/README.md)
to JUnit 5 as an extension, written in Java 17 and usable from Kotlin.
Qualification tests use composed annotations (`@IQ`, `@OQ`, `@PQ`, `@IU`) and
receive a `QualifyContext` parameter. The library writes the same record files
as the TypeScript reference and ships `merge` and `validate` as a runnable jar.

This brief produces one pull request on branch `feat/qualify-jvm`. It starts
after qat-003 is merged and runs in parallel with qat-004. No JVM version of
this framework existed before; this is new work.

## Already Done, Do Not Redo

- The specification, schema, scenarios and expected files exist on `main` after
  qat-003. Verify the expected files are present before starting.
- `@lekman/qualify` (TypeScript) implements the same behaviour. Read it for
  intent when the specification leaves a detail open.
- devops-actions has no Gradle composite. A plain `actions/setup-java` plus
  Gradle step is expected here.

## Steps

1. **Scaffold** `packages/qualify-jvm/` as a Gradle build with the Kotlin DSL
   and the Gradle wrapper committed: group `com.lekman`, artifact `qualify`,
   version `0.1.0`, Java toolchain 17, `java-library` plugin. Dependencies:
   `org.junit.jupiter:junit-jupiter-api` as `api`, Jackson databind for JSON,
   and a JSON Schema 2020-12 validator (for example
   `com.networknt:json-schema-validator`) for `validate` and for tests. Add a
   small Kotlin test source set that uses the annotations from Kotlin, so the
   Kotlin call shape is proven. Do not add a `package.json`.
2. **Annotations and extension**: `@IQ`, `@OQ`, `@PQ`, `@IU` meta-annotated
   with `@Test`, `@Tag("<level>")` and `@ExtendWith(QualifyExtension.class)`.
   `QualifyExtension` implements `ParameterResolver`,
   `BeforeTestExecutionCallback`, `AfterTestExecutionCallback`, `TestWatcher`
   and `ExecutionCondition`, as section 2.4 of the specification says.
   Declared `tags` must be selectable: prove with a test that a Gradle
   `includeTags` filter selects them, or document the limitation in the README
   if JUnit cannot add tags at runtime.
3. **Core**: declaration validation, checks and matchers (Java names mapped to
   the shared JSON names), outcomes, normalisation, redaction, environment and
   policy, the run envelope and the atomic writer, matching sections 2 to 7.
   The run ID comes from `QUALIFY_RUN_ID`, or a JUnit Platform
   `LauncherSessionListener` creates one per launcher session.
4. **CLI**: a `main` class for `merge` and `validate` with the specification's
   flags and exit codes, runnable as `java -jar qualify-<version>-cli.jar`
   (a shaded or `application` distribution). `trace` prints a pointer to
   `npx @lekman/qualify trace` and exits 64.
   4a. **PDF report**: `qualify report` as specified in section 9 of the specification, rendered with Apache PDFBox, whose `PDFTextStripper` also extracts text in tests. Bundle Noto Sans (SIL Open Font License, include its licence file) and embed the subset used. Pass conformance scenario 21 (`report`): the extracted text holds every line of `expected/report.outline.txt` in order, and the metadata matches. Add a sample PDF from the conformance run to the package README as an image of its first two pages.
5. **Conformance**: one JUnit test class per scenario under a `conformance`
   source set, plus a Gradle task (`./gradlew conformance`) that runs each
   scenario through the JUnit Platform launcher exactly as the scenario text
   says, merges, masks and diffs against `spec/qualify/conformance/expected/`.
   Use JUnit's parallel execution with at least two threads for
   `parallel-determinism`, and `Runtime.getRuntime().halt` in a forked test JVM
   for `crash`. Scenarios 12 and 19 use the TypeScript CLI for `trace`.
6. **CI**: a `jvm` job in `.github/workflows/ci.yml` with `actions/setup-java`
   (pinned to a commit SHA with a version comment, Temurin 17), Gradle build,
   tests and conformance. Add it to the quality gate as required.
7. **Docs**: `packages/qualify-jvm/README.md` with Gradle (Kotlin DSL) and Maven
   coordinates, a Kotlin and a Java example, the CLI jar, and what it costs.
   Update the index tables and the practice.
8. **Verify**: `./gradlew build conformance`, coverage with JaCoCo at the
   repository thresholds, the root checks, and actionlint on the workflow. Draft
   pull request with the repository's template.

## Failure Interpretation

- `when` is reserved only in Kotlin, where it needs backticks. In Java it is an
  ordinary annotation attribute name, so a Java compile error on `when` points
  at another mistake on that line.
- Jackson writes `1.0` for a `double` 1; the specification's JSON values follow
  the TypeScript reference, which writes `1`. Normalise numbers before
  serialising.
- If the JVM output differs from an expected file and the specification supports
  the JVM result, stop and raise a specification pull request. Never edit an
  expected file here.

## Outcome

2026-11-20, implementation session. Branch `feat/qualify-jvm`, stacked on
`feat/qualify-typescript` at 454c8de (the themed report and its layout fixes).
Committed locally; the coordinating session pushes and opens the pull request,
so step 8's draft pull request is not opened here.

### Result

- `packages/qualify-jvm` is a Gradle 9.9.2 build (Kotlin DSL, wrapper
  committed, distribution checksum pinned): `com.lekman:qualify` 0.1.0, Java 17
  bytecode, `java-library`. Run-time dependencies: `junit-jupiter-api` 5.14.4
  (`api`), JSpecify 1.0.0 (`api`), Jackson 3.2.4 databind and YAML,
  json-schema-validator 3.0.9 (which uses Jackson 3), and Apache PDFBox 3.0.8.
  No `package.json`.
- `@IQ`, `@OQ`, `@PQ` and `@IU` are composed annotations with `@Test`, the
  level's `@Tag` and `@ExtendWith(QualifyExtension.class)`. `@IQ` and `@IU`
  have no `scope` attribute, so declaring one is a compile error.
  `QualifyExtension` implements the five interfaces of the brief plus
  `InvocationInterceptor`, which replaces a failure whose message holds a
  registered secret, so JUnit's own report never shows the value.
- Outcomes come from `getExecutionException()` in `afterTestExecution`:
  `CheckFailed` and any `AssertionError` are `fail`, a `TestAbortedException`
  (assumptions, `ctx.skip`) is `skip`, anything else `error`. Failed soft
  checks with no exception fail the test there with `CheckFailed`. A policy
  denial or "not applicable" rule is decided in `ExecutionCondition`, which
  writes the marker and a `skip` record; when conditions are switched off
  (`junit.jupiter.conditions.deactivate`) the policy is applied in
  `beforeTestExecution` instead. `TestWatcher` writes the record of a started
  test whose after-execution callback never ran.
- The run ID is `QUALIFY_RUN_ID` or `qualify.runId`, else one ULID per
  launcher session, kept in JUnit 5.13's `StoreScope.LAUNCHER_SESSION` store.
  This needs no `LauncherSessionListener`, and it holds for Gradle and the
  testkit alike. Gradle forks get one session each; the README says to set
  `QUALIFY_RUN_ID` or merge with `--allow-runs`.
- Sites: a declaration's site is the first line of its method, read from the
  class file's `LineNumberTable`, because Java has no API for an annotation's
  line. A path is found under `src/*/java`, `src/*/kotlin` and
  `qualify.sourceRoots`, relative to the git root.
- CLI jar `qualify-0.1.0-cli.jar` (Shadow, 9 MB): `merge`, `validate`,
  `report`; `trace` prints the `npx @lekman/qualify trace` pointer and exits 64.
- Report: PDFBox with the themes copied byte for byte from
  `spec/qualify/report/themes` at build time, a unit test comparing every file
  with the spec, theme validation (schema, tokens, fonts, logo), `--theme`,
  `--subtitle`, `--classification` and `QUALIFY_REPORT_THEME`. The two layout
  fixes of 9b88049 (fills drawn first, headings kept with what follows) are
  ported. Pages 1 to 3 of both themes were rendered with PDFBox's
  `PDFRenderer` and compared by eye with the TypeScript images: same layout,
  every glyph drawn, no subsetting fault. They are in the package README.

### Conformance

`./gradlew conformance`: 24 of 24 pass. Scenarios 1 to 20 (21 runs, with
policy-skip A and B), 16 on two threads twice, 21 and 22, and the shared run
ID check. Each scenario runs its JUnit classes through the launcher in a fresh
JVM with a clean `QUALIFY_*` environment and `-ea`; crash uses
`Runtime.getRuntime().halt` in that JVM. `merge` and `validate` come from the
CLI jar, `trace` from `packages/qualify/dist/cli.js`. Scenario 21 extracts text
with `PDFTextStripper`. No expected file was changed.

### Quality Gates

`./gradlew build` fails on any violation of: Spotless with google-java-format
1.32.0 (Java) and ktlint 1.7.1, `ktlint_official` (Kotlin and the build
scripts); Error Prone 2.52.0 with NullAway 0.14.3 on `com.lekman.qualify`,
with `-Werror`; detekt 1.23.8, default rules plus `maxIssues: 0`; JaCoCo 0.8.14
at line and instruction 0.8, method 0.6. Measured: 95.8 % of lines, 98.9 % of
methods, 74 unit tests plus one Kotlin test. Kover does not apply: the only
Kotlin is test code, and JaCoCo measures the library.

### Deviations

- Error Prone 2.43 and later and google-java-format 1.32.0 run only on JDK 21,
  so the Gradle daemon and `javac` use JDK 21 (`gradle-daemon-jvm.properties`,
  the foojay resolver) with `--release 17`. `mise.toml` still pins Temurin
  17, which runs the tests, the conformance JVMs and the CLI.
- Tags: JUnit has no hook that adds a tag at discovery, so a value only in
  the `tags` attribute cannot be selected. The record holds the declared tags
  and the test's JUnit tags except the level, so `@Tag("export")` both selects
  and records. A test proves both. Spec section 2.4 is corrected in its own
  `docs(qualify)` commit; the TypeScript conformance still passes.
- `timeoutMs` is not an annotation attribute; JUnit's `@Timeout` is the
  runner's own timeout. `delegate` returns nothing and `delegateValue` returns
  the work's result, so a Kotlin lambda is never ambiguous between them.
- The quality gate configuration (`required` in the gate's results) is only
  on `ci/align-devops-actions` (pull request 9), not on this branch, so the
  `jvm` job could not be added to it here. When both merge, `jvm` belongs in
  the gate's `required` list.
- `eslint.config.mjs` now ignores `packages/qualify-jvm/build/`: after a local
  Gradle build, the root lint failed on the HTML reports' scripts. Pull
  request 12 edits the same `ignores` line.
