# Packages

Runnable tools. The TypeScript packages are built with [Bun](https://bun.sh)
and published for Node 20 or later. Bun is a build-time tool, not a requirement
for users. Dependencies are bundled into the build unless the package README
says otherwise. The Python package is built with hatchling and managed with
[uv](https://docs.astral.sh/uv/); it carries its own `pyproject.toml` and no
`package.json`, so the Bun workspace leaves it alone.
The Java package is built with Gradle and the wrapper it
carries, and `qualify-dotnet` with the .NET SDK for NuGet. Neither has a
`package.json`, so the Bun workspace leaves them alone.

| Package                                     | What it does                                                                                                                                   | Practice                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [data-sampler/](data-sampler/README.md)     | Classification-first JSON test data generator, built on faker                                                                                  | [graded-test-data/](../practices/graded-test-data/README.md)       |
| [qualify/](qualify/README.md)               | Qualification tests for vitest, node:test and bun that write redacted JSON evidence and a trace matrix; TypeScript in progress                 | [qualification-tests/](../practices/qualification-tests/README.md) |
| [qualify-python/](qualify-python/README.md) | Qualification tests for pytest that write the same redacted JSON evidence; Python in progress                                                  | [qualification-tests/](../practices/qualification-tests/README.md) |
| [qualify-jvm/](qualify-jvm/README.md)       | Qualification tests for JUnit 5, from Java or Kotlin, that write the same redacted JSON evidence and PDF report; in progress                   | [qualification-tests/](../practices/qualification-tests/README.md) |
| [qualify-dotnet/](qualify-dotnet/README.md) | The same qualification tests for xUnit v3 on .NET 10 and 11, with a `qualify` .NET tool for merge, validate and the PDF report; C# in progress | [qualification-tests/](../practices/qualification-tests/README.md) |
