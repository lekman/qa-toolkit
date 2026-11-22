# @lekman/test-sets

One file, `qa.yaml` at the repository root, that says which tests a
repository has: each test set names a level, a runner and the package folders
it covers, and may name the command that runs it. The `qa` command line and
the [VS Code extension](../qualify-vscode/README.md) read the same file, so a
set runs the same way from a terminal, from CI and from the editor.

Version 0.1, not released. This package holds the file format, its
[JSON Schema](schema/test-sets.schema.json), the code that reads it, and a
declarative definition of each test runner.

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

## Runner Definitions

Each runner is a JSON file in [runners/](runners/runner.schema.json), the way
Trunk defines a linter in its plugin file: data, read by one generic runner
in the CLI and the extension. A new runner is a new file.

| Runner        | Finds tests in                               | Runs a selection with                     | Writes JUnit XML with                                                   | qualify |
| ------------- | -------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | ------- |
| `vitest`      | `*.test.ts`, `*.spec.ts` and the JS variants | `vitest run -t '<pattern>'`               | `--reporter=junit --outputFile.junit=${junitFile}`                      | yes     |
| `node-test`   | the same                                     | `node --test --test-name-pattern=…`       | `--test-reporter=junit --test-reporter-destination=${junitFile}`        | yes     |
| `bun-test`    | the same                                     | `bun test -t '<pattern>'`                 | `--reporter=junit --reporter-outfile=${junitFile}`                      | yes     |
| `cucumber-js` | `*.feature`                                  | `cucumber-js --name '^<ID>\b'`            | `--format junit:${junitFile}`                                           | yes     |
| `pytest`      | `test_*.py`, `*_test.py`                     | `pytest -k '<A> or <B>'`                  | `--junitxml=${junitFile}`                                               | yes     |
| `gradle`      | `src/test/**/*.java`, `*.kt`                 | `gradlew test --tests '*Class.method'`    | always, in `build/test-results/test/TEST-*.xml`                         | yes     |
| `maven`       | the same                                     | `mvn test -Dtest='Class#method'`          | always, in `target/surefire-reports/TEST-*.xml`                         | yes     |
| `dotnet`      | `*Test*/**/*.cs`                             | `dotnet test --filter 'DisplayName~<ID>'` | `--logger 'junit;LogFilePath=${junitFile}'`, with `JunitXml.TestLogger` | yes     |
| `storybook`   | `*.stories.*`, `*.mdx`                       | `test-storybook --testNamePattern=…`      | `--junit`, with `JEST_JUNIT_OUTPUT_DIR` and `JEST_JUNIT_OUTPUT_NAME`    | no      |
| `playwright`  | `e2e/**/*.spec.ts`, `*.e2e.ts`               | `playwright test --grep '<pattern>'`      | `--reporter=list,junit`, with `PLAYWRIGHT_JUNIT_OUTPUT_FILE`            | no      |

A definition holds:

| Field            | What it says                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `files`          | Globs of the files that hold its tests                                                                         |
| `command`        | The default command, with `${tool}`, `${filter}`, `${ids}`, `${junitFile}` and the other placeholders          |
| `tools`          | What `${tool}` becomes: `bunx` with a `bun.lock`, the Gradle wrapper when there is one, and so on              |
| `select`         | How `${filter}` selects tests by ID with the runner's own filter                                               |
| `junit`          | The arguments or variables that make it write JUnit XML, where the XML lands, and what must be installed first |
| `qualify`        | Whether the framework has a qualify adapter, so its qualification tests write qualify evidence                 |
| `packageMarkers` | Build files that pick it over another runner of the same framework, such as `pom.xml` for Maven                |

```ts
import { RunnerDefinitions } from "@lekman/test-sets";

RunnerDefinitions.byId("pytest");
RunnerDefinitions.forFramework("junit", ["pom.xml"]); // maven
```

## What It Costs

- **One more file to keep true.** A set that names a folder that moved runs
  nothing. The CLI reports a set that matched no folder.
- **A runner's own flags change.** A definition pins the flags a runner
  takes today. When a runner renames one, its definition needs a new
  release; a set's `command` can override it until then.
- **The file says what runs, not what exists.** Tests in a folder no set
  covers are not run by `qa` and not shown in the editor's set tree.
