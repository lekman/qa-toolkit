# qat-005: qualify, Java and Kotlin

> **Status:** Dispatched | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-005

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

_Empty at dispatch._
