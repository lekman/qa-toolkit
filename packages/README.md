# Packages

Runnable tools. The TypeScript packages are built with [Bun](https://bun.sh)
and published for Node 20 or later. Bun is a build-time tool, not a requirement
for users. Dependencies are bundled into the build unless the package README
says otherwise. The Python package is built with hatchling and managed with
[uv](https://docs.astral.sh/uv/); it carries its own `pyproject.toml` and no
`package.json`, so the Bun workspace leaves it alone.

| Package                                     | What it does                                                                                                                   | Practice                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [data-sampler/](data-sampler/README.md)     | Classification-first JSON test data generator, built on faker                                                                  | [graded-test-data/](../practices/graded-test-data/README.md)       |
| [qualify/](qualify/README.md)               | Qualification tests for vitest, node:test and bun that write redacted JSON evidence and a trace matrix; TypeScript in progress | [qualification-tests/](../practices/qualification-tests/README.md) |
| [qualify-python/](qualify-python/README.md) | Qualification tests for pytest that write the same redacted JSON evidence; Python in progress                                  | [qualification-tests/](../practices/qualification-tests/README.md) |
