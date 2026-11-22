# Qualify Tests for VS Code

Shows qualification tests (IQ, OQ, PQ and intended use) in the VS Code
Testing view, grouped the way a reviewer reads them: product, then package,
then level, then test. It finds the tests by reading the source, runs them
with each language's own runner, and shows each result from the evidence
record the run wrote. It follows the
[qualify specification](../../spec/qualify/README.md).

Version 0.1, not released to the Marketplace or Open VSX. Install it from the
`.vsix`.

## What It Shows

```text
Qualification
└─ my-product                        a workspace folder
   ├─ apps/web                       the nearest folder with a build file
   │  └─ IU                          Intended Use · 2 tests
   │     ├─ IU-SUPPORT-001 Support lists every open request    REQ-SUPPORT-001 · risk high
   │     └─ IU-SUPPORT-002 A picked customer sees only their own requests
   └─ services/export
      ├─ IQ                          Installation Qualification
      └─ OQ                          Operational Qualification
         └─ OQ-EXPORT-API-001 …      shown as an error: the ID breaks the pattern
```

- **Product** is the workspace folder. Open a multi-root workspace to see
  several products side by side.
- **Package** is the nearest folder, up to the workspace folder, with a
  `package.json`, `pyproject.toml`, `setup.py`, Gradle or Maven build, or a
  `.csproj`.
- **Level** is IQ, OQ, PQ or IU, from the test's ID.
- **Test** is labelled `<ID> <title>`, with its requirements and risk beside
  it. A declaration that breaks a rule of the specification is shown as an
  error item with the reason: an ID that does not match
  `^(IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,}$`, a prefix that is not the
  level, a missing `scope` on an OQ or PQ test, an ID declared twice, or a
  Scenario Outline. It is never hidden, and it is not run.

The tree updates when a file changes. Nothing runs to build it.

## What It Reads

| Language               | Declaration                                         | Read from files that                               | Runner                              |
| ---------------------- | --------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| TypeScript, JavaScript | `oq("OQ-…", "title", { … }, fn)`                    | import `@lekman/qualify/vitest`, `/node` or `/bun` | vitest, `node --test` or `bun test` |
| Python                 | `@qualify.oq("OQ-…", "title", …)`                   | import `qualify`                                   | pytest                              |
| Java, Kotlin           | `@OQ(id = "OQ-…", title = "…", …)`                  | use `com.lekman.qualify`                           | Gradle, or Maven with a `pom.xml`   |
| C#                     | `[OQ("OQ-…", "title", …)]`                          | use `Lekman.Qualify`                               | `dotnet test`                       |
| Gherkin                | `Scenario: IU-… title`, tags `@REQ-…` and `@risk-…` | are `.feature` files                               | cucumber-js                         |

Requirements, risk, scope and tags are read when they are written as
literals. A value held in a variable is left out. An ID held in a variable is
an error item, because the ID cannot be known without running the test.

In a feature file, a scenario is a qualification test when its name starts
with a level prefix. The cucumber adapter of `@lekman/qualify` reads the same
convention: `@REQ-…` tags are requirements (the tag without its `@`, such as
`REQ-SUPPORT-001`), `@risk-…` the risk and `@scope-…` the scope. Feature and
rule tags apply to every scenario under them. Only English keywords are read.

## Install

```bash
code --install-extension qualify-vscode-0.1.0.vsix
```

To build the `.vsix` from this repository:

```bash
bun install
bun run --cwd packages/qualify-vscode package
```

VS Code 1.90 or later.

## Running Tests

Run a test, a level, a package or a product from the Testing view. The
extension runs one command per package and runner, from the package folder,
with the runner's own ID filter:

| Runner        | Default command                                                     |
| ------------- | ------------------------------------------------------------------- |
| `vitest`      | `npx vitest run -t '\[OQ-A-001\]\|\[OQ-A-002\]'`                    |
| `node-test`   | `node --test --test-name-pattern='\[OQ-A-001\]'`                    |
| `bun-test`    | `bun test -t '\[OQ-A-001\]'`                                        |
| `pytest`      | `python -m pytest -k 'OQ-A-001 or OQ-A-002'`                        |
| `gradle`      | `./gradlew test --tests '*BankFileTest.bankFileKeepsAmounts'`       |
| `maven`       | `mvn test -Dtest='BankFileTest#bankFileKeepsAmounts'`               |
| `dotnet`      | `dotnet test --filter 'DisplayName~OQ-A-001\|DisplayName~OQ-A-002'` |
| `cucumber-js` | `npx cucumber-js --name '^IU-A-001\b'`                              |

`npx` becomes `bunx`, `pnpm exec` or `yarn` when the package or a folder above
it has that tool's lockfile. `python -m pytest` becomes `uv run pytest` or
`poetry run pytest` with a `uv.lock` or `poetry.lock`, and `gradle` or `mvn`
becomes the wrapper when there is one. Each run sets `QUALIFY_EVIDENCE_DIR`
to the evidence folder and `QUALIFY_RUN_ID` to a new run ID.

After the command ends, the extension reads the records under the evidence
folder that changed during the run:

- the outcome sets the test's result: `pass`, `fail`, `error`, or `skip` with
  its reason in the output;
- each failed check, hard or soft, is a message at the declaration, with the
  expected and actual values as a diff. The values are already redacted by
  the process that ran the test;
- the path of each record is in the test's output;
- a test the run left no record for is shown as skipped, with "not run" and
  the command's exit code in its output;
- a test with several records, such as one per viewport, takes the worst
  outcome: fail, then error, then pass, then skip.

A record counts when it carries the run's ID. For a command that sets its own
run ID, a record counts when it ended after the run started.

## Settings

| Setting               | Default                                                                  | What it does                                                                         |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `qualify.evidenceDir` | `qualification/evidence`                                                 | Where tests write evidence, relative to the package folder                           |
| `qualify.runners`     | `{}`                                                                     | A command per runner ID, for every package                                           |
| `qualify.packages`    | `{}`                                                                     | Per package folder (relative, `.` for the root): `command`, `runners`, `evidenceDir` |
| `qualify.exclude`     | `node_modules`, `dist`, `build`, `bin`, `obj`, `target`, `.venv`, `.git` | Globs that discovery skips                                                           |
| `qualify.traceFiles`  | `**/{trace.md,trace.json}`                                               | Where **Qualify: Open Trace Matrix** looks                                           |

A command may use these placeholders:

| Placeholder          | Becomes                                                  |
| -------------------- | -------------------------------------------------------- |
| `${filter}`          | The runner's own filter for the selected tests           |
| `${ids}`             | The selected test IDs, separated by spaces               |
| `${id}`              | One test ID; the command then runs once per test         |
| `${package}`         | The package folder, as an absolute path                  |
| `${evidenceDir}`     | The evidence folder, as an absolute path                 |
| `${tool}`            | The launcher the runner definition picks, such as `bunx` |
| `${workspaceFolder}` | The workspace folder                                     |

To run a package's tests through a task runner, with its own evidence folder:

```jsonc
// .vscode/settings.json
{
  "qualify.packages": {
    "apps/web": {
      "command": "task test:intended-use -- ${ids}",
      "evidenceDir": "test-results/evidence",
    },
  },
}
```

## Test Sets from qa.yaml

When a workspace folder has a [`qa.yaml`](../test-sets/README.md) at its
root, the extension reads it too:

- **Ordinary sets** (`unit`, `story`, `integration`) add their tests to the
  tree, under the set's package folders and its level, labelled with the
  test's name and its file. Names are read without running anything: `test`
  and `it` in JavaScript, `test_` functions in Python, stories, scenarios,
  and JUnit and xUnit test methods. A file with no name found is one item.
  A test that is also a qualification test is listed once, at its
  qualification level.
- **Running an ordinary test** runs its whole set in its package, the way
  `qa run` does, with the runner's JUnit flags or the set's own `command`.
  Each test's result comes from the JUnit XML: by its name, and by its file
  when the report names one. A test the report does not name is shown as
  not run.
- **Qualification sets** (IQ, OQ, PQ, IU) lend their `command`, `results`
  folder and `env` to the qualification tests of their package and runner,
  unless `qualify.packages` sets them for that package.

Each ordinary test also carries the tag `set:<name>`, so
`@qualify:set:unit` filters by set. A `qa.yaml` that is not valid is shown
as a warning, and its sets are left out.

## Filtering

Each test carries Testing view tags. Type them in the Testing view's filter
box:

| Filter                         | Shows                                |
| ------------------------------ | ------------------------------------ |
| `@qualify:level:iu`            | Intended-use tests                   |
| `@qualify:risk:high`           | High-risk tests                      |
| `@qualify:req:REQ-SUPPORT-001` | The tests that cover one requirement |
| `@qualify:tag:export`          | Tests with a free tag                |
| `@qualify:runner:pytest`       | Tests one runner runs                |
| `@qualify:error`               | Declarations that break a rule       |
| `@qualify:set:unit`            | The tests of one `qa.yaml` set       |
| `!@qualify:risk:low`           | Everything except low-risk tests     |

## Trace Matrix

**Qualify: Open Trace Matrix** opens the output of `qualify trace` (`--md` or
`--json`). With several, it asks which one. It does not run `qualify trace`.

## What It Costs and What It Does Not Do

- **Static discovery reads literals.** A test declared through a helper
  function, or with its ID in a variable, is not found or not runnable. That
  is the price of building the tree without running anything.
- **Selection by ID is a pattern.** pytest's `-k` matches a substring, so
  `OQ-A-001` also selects `OQ-A-0010`. The other runners match the whole ID.
- **JUnit selects by class and method**, because JUnit cannot select by a
  tag that qualify adds at run time. A test whose method cannot be read is
  not run.
- **No debugging.** There is a Run profile only.
- **A large selection is one long command line.** Running a package with
  hundreds of tests passes every ID to the runner.
- **An ordinary test runs with its whole set.** Selecting one unit test
  runs every test of its set in that package; only the selected ones show a
  result.
- **JUnit names are matched, not known.** A runner that names a case
  differently from the source, such as a parametrised test, leaves the
  test as not run.
- **Evidence is read only after a run.** Records from an earlier run, or from
  CI, are not shown when VS Code starts.

## Layout

The extension follows the repository's
[clean architecture rules](../../.claude/rules/clean-architecture.md). VS Code,
the file system and processes are touched only in `src/extension/*.system.ts`.

| Folder           | Holds                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/discovery/` | The parsers, one per language, and the declaration rules                                                             |
| `src/packages/`  | Which package a file belongs to                                                                                      |
| `src/runners/`   | The command lines a runner definition makes. The definitions are data in [@lekman/test-sets](../test-sets/README.md) |
| `src/sets/`      | Ordinary tests of the sets in `qa.yaml`, and their JUnit results                                                     |
| `src/results/`   | The result-reader port and the qualify evidence reader                                                               |
| `src/runs/`      | The run plan and its execution, behind process and reporter ports                                                    |
| `src/tree/`      | The tree: product, package, level, test, and the tags                                                                |
| `src/extension/` | The VS Code adapters                                                                                                 |
| `test-host/`     | The extension host test and its fixture workspace                                                                    |

```bash
bun test                 # unit tests, with fakes for the ports
bun run test:host        # starts VS Code with test-host/fixture and checks the tree
bun run package          # builds qualify-vscode-<version>.vsix
```

`test:host` downloads VS Code into `.vscode-test/` the first time. On Linux
without a display, run it under `xvfb-run -a`.
