# qa-toolkit

> Free tools and written practices for testing you can prove, sized to the risk.

Most teams can tell you their tests passed. Fewer can tell you what the tests
covered, why that was enough, and show the evidence six months later. This
repository collects the tools and the reasoning I use to close that gap, on
regulated projects and on ordinary ones.

Everything here is MIT-licensed and free to use. Each tool comes with a written
practice: why it exists, what it costs you, and when not to use it.

## What Is Here

| Tool                                                    | What it does                                                                                                                                        | Status                                                                                                                                                                                                                                    | Practice                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [@lekman/data-sampler](packages/data-sampler/README.md) | Generates JSON test data where the grade of every record is decided first, so tests can assert on it                                                | 0.1.0 on npm                                                                                                                                                                                                                              | [Graded test data](practices/graded-test-data/README.md)       |
| [qualify](spec/qualify/README.md)                       | Qualification tests (IQ, OQ, PQ, intended use) that leave redacted JSON evidence and a trace matrix, for TypeScript, Python, Java or Kotlin, and C# | Specification in draft; [TypeScript](packages/qualify-ts/README.md), [Python](packages/qualify-python/README.md), [Java and Kotlin](packages/qualify-jvm/README.md) and [C#](packages/qualify-dotnet/README.md) in progress, not released | [Qualification tests](practices/qualification-tests/README.md) |

A tool marked "in progress" is not ready to install. Its specification is
public so you can see where it is going and comment on it.

## Who It Is For

- **Engineering leads and testers** who want tests that show what they checked,
  not only that they passed.
- **Teams in regulated work** (GxP, medical devices, finance) who need evidence
  a reviewer can read without the code.
- **Teams outside regulated work** who want the useful parts of that discipline
  without the paperwork.

If your tests already tell you everything you need, you do not need this.

## How the Repository Is Organised

| Folder                            | Holds                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| [packages/](packages/README.md)   | The tools you install and run. Each has its own README with install and usage.           |
| [practices/](practices/README.md) | The reasoning half: the problem each tool solves, the pattern, and the trade-offs.       |
| [spec/](spec/README.md)           | Specifications that more than one package implements, such as qualify's evidence schema. |
| [docs/](docs/CONTRIBUTING.md)     | How to contribute, and the briefs that plan each piece of work.                          |

## Principles

- **Decide what matters before you test.** A test written from a stated claim
  can fail in a way that means something.
- **Size the effort to the risk.** Not every function needs the same depth of
  testing, and these tools let you say which ones do.
- **Keep the evidence where people can read it.** Plain JSON and Markdown, not a
  vendor format.
- **Say what it costs.** Every practice names the trade, not only the benefit.

## Contributing

Issues and pull requests are welcome. Read
[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) first. Two rules matter most here:

- The repository is public. Examples use placeholders such as Acme and
  PROJ-123, never real organisations. A commit hook and a CI check enforce it.
- A change to a tool updates its practice when the reasoning changes.

## Licence

[MIT](LICENSE). Copyright Tobias Lekman.

## Related

- [lekman.com](https://lekman.com): articles that explain these practices in
  context.
- [lekman/ai-toolkit](https://github.com/lekman/ai-toolkit): practices for
  working with Claude, and the source of this repository's tooling conventions.
