# Packages

Runnable TypeScript. Every package is built with [Bun](https://bun.sh) and
published for Node 20 or later. Bun is a build-time tool, not a requirement for
users. Dependencies are bundled into the build unless the package README says
otherwise. `qualify-dotnet` is the exception: C#, built with the .NET SDK for
NuGet, with no `package.json`, so the Bun workspace leaves it out.

| Package                                     | What it does                                                                                                                                   | Practice                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [data-sampler/](data-sampler/README.md)     | Classification-first JSON test data generator, built on faker                                                                                  | [graded-test-data/](../practices/graded-test-data/README.md)       |
| [qualify/](qualify/README.md)               | Qualification tests for vitest, node:test and bun that write redacted JSON evidence and a trace matrix; TypeScript in progress                 | [qualification-tests/](../practices/qualification-tests/README.md) |
| [qualify-dotnet/](qualify-dotnet/README.md) | The same qualification tests for xUnit v3 on .NET 10 and 11, with a `qualify` .NET tool for merge, validate and the PDF report; C# in progress | [qualification-tests/](../practices/qualification-tests/README.md) |
