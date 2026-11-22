# @lekman/test-sets

One file, `qa.yaml` at the repository root, that says which tests a
repository has: each test set names a level, a runner and the package folders
it covers, and may name the command that runs it. The `qa` command line and
the [VS Code extension](../qualify-vscode/README.md) read the same file, so a
set runs the same way from a terminal, from CI and from the editor.

Version 0.1, not released. This package holds the file format, its
[JSON Schema](schema/test-sets.schema.json) and the code that reads it.

## The File

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/lekman/qa-toolkit/main/packages/test-sets/schema/test-sets.schema.json
version: 1
sets:
  - name: unit
    level: unit
    runner: vitest
    paths: ["packages/*"]

  - name: stories
    level: story
    runner: storybook
    paths: [packages/design]

  - name: web-intended-use
    level: IU
    runner: cucumber-js
    paths: [apps/web]
    command: task test:intended-use -- ${ids}
    results: test-results/evidence
```

| Field     | Required | Rule                                                                                                              |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`    | yes      | Lower case, digits, `.`, `_` and `-`. Unique in the file.                                                         |
| `level`   | yes      | `unit`, `story` or `integration` for ordinary tests; `IQ`, `OQ`, `PQ` or `IU` for qualification tests.            |
| `runner`  | yes      | The ID of a runner definition, such as `vitest`, `pytest` or `cucumber-js`.                                       |
| `paths`   | yes      | Package folders relative to the repository root. `*` matches one folder name and `**` any depth; `.` is the root. |
| `files`   | no       | Globs of the test files inside each package. The runner definition's globs when left out.                         |
| `command` | no       | The command, run in each package folder. The runner definition's command when left out.                           |
| `results` | no       | Where results land, relative to the package folder.                                                               |
| `env`     | no       | Environment variables for the command.                                                                            |

The level decides how results are read. A qualification set (IQ, OQ, PQ, IU)
is read from the [qualify evidence](../../spec/qualify/README.md) its tests
write. Every other set is read from JUnit XML, which every supported runner
can write.

## Reading It

```ts
import { TestSets } from "@lekman/test-sets";

const { file, problems } = TestSets.parse(text);
const sets = file ? TestSets.forFolder(file, "apps/web") : [];
```

| Call                            | Returns                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `TestSets.parse(text)`          | The sets, or the problems: YAML errors, schema violations, repeated names |
| `TestSets.forFolder(file, dir)` | The sets that cover a package folder                                      |
| `TestSets.select(file, filter)` | The sets with the given names or levels, and any unknown names            |
| `TestSets.resultFormat(set)`    | `qualify-evidence` for a qualification level, `junit-xml` otherwise       |

The reader never throws on bad input and never touches the file system: the
caller reads the file and passes its text.

## What It Costs

- **One more file to keep true.** A set that names a folder that moved runs
  nothing. The CLI reports a set that matched no folder.
- **The file says what runs, not what exists.** Tests in a folder no set
  covers are not run by `qa` and not shown in the editor's set tree.
