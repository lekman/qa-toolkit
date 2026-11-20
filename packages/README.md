# Packages

Runnable tools. The TypeScript packages are built with [Bun](https://bun.sh)
and published for Node 20 or later. Bun is a build-time tool, not a requirement
for users. Dependencies are bundled into the build unless the package README
says otherwise. The Java package is built with Gradle and the wrapper it
carries; it has no `package.json`, so the Bun workspace leaves it alone.

| Package                                 | What it does                                                                                                                   | Practice                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [data-sampler/](data-sampler/README.md) | Classification-first JSON test data generator, built on faker                                                                  | [graded-test-data/](../practices/graded-test-data/README.md)       |
| [qualify/](qualify/README.md)           | Qualification tests for vitest, node:test and bun that write redacted JSON evidence and a trace matrix; TypeScript in progress | [qualification-tests/](../practices/qualification-tests/README.md) |
| [qualify-jvm/](qualify-jvm/README.md)   | Qualification tests for JUnit 5, from Java or Kotlin, that write the same redacted JSON evidence and PDF report; in progress   | [qualification-tests/](../practices/qualification-tests/README.md) |
