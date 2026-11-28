# JUnit XML and LCOV Samples

Input for `qualify import junit` (section 6.6 of the
[specification](../../../README.md)). Each file was written by the runner
named below, from a small sample project with the same tests: a passing test
whose name carries a qualify ID, other passing tests, failing tests, and a
skipped test. In pytest the ID cannot be in the name, because a Python
function name cannot hold a hyphen. Absolute paths and host names were then replaced with
`/home/runner/work/sample` and `runner`. Nothing else was edited.

| File                | Written by                                                      | Shape                                                                                          |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun.xml`           | `bun test --reporter=junit`, bun 1.3.14                         | Nested `testsuite` elements, one per file and one per `describe`; a `failure` with no message  |
| `vitest.xml`        | `vitest run --reporter=junit`, vitest 5.1.1                     | One suite per file; `describe` names joined into the test name with `>`                        |
| `pytest.xml`        | `pytest --junitxml -o junit_family=xunit2`, pytest 8.4.2        | One suite; a timestamp with a zone; failures with a message and no type; a skip with a message |
| `gradle-junit5.xml` | Gradle's `test` task with JUnit 5.13.4                          | One `testsuite` root per class; a `DisplayName`; Java stack traces                             |
| `xunit.xml`         | an xUnit v3 3.2.0 test project run with `-junit`                | One suite per test collection; exceptions as `failure` with a type                             |
| `bun.lcov.info`     | `bun test --coverage --coverage-reporter=lcov`, bun 1.3.14      | Lines from `DA`, functions as `FNF`/`FNH` totals only                                          |
| `pytest.lcov.info`  | `pytest --cov --cov-branch --cov-report=lcov`, pytest-cov 7.0.0 | `DA`, `FN`/`FNDA` and `BRDA` records                                                           |
