# Packages

Runnable TypeScript. Every package is built with [Bun](https://bun.sh) and
published for Node 20 or later. Bun is a build-time tool, not a requirement for
users. Dependencies are bundled into the build unless the package README says
otherwise.

| Package                                 | What it does                                                                                                                   | Practice                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [data-sampler/](data-sampler/README.md) | Classification-first JSON test data generator, built on faker                                                                  | [graded-test-data/](../practices/graded-test-data/README.md)       |
| [qualify/](qualify/README.md)           | Qualification tests for vitest, node:test and bun that write redacted JSON evidence and a trace matrix; TypeScript in progress | [qualification-tests/](../practices/qualification-tests/README.md) |
