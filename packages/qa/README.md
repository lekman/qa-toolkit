# @lekman/qa

`qa` runs the test sets of a repository, the way Trunk runs its linters: one
file says what there is, `qa run` runs it with each runner's own command,
and the results come back as one JUnit XML report and one summary.
Qualification sets (IQ, OQ, PQ, IU) also get their evidence merged and, with
`--report`, a PDF from `qualify report`.

Version 0.1, not released. The sets come from `qa.yaml`, described in
[@lekman/test-sets](../test-sets/README.md), which also holds the runner
definitions.

## Use

```bash
qa list                       # the sets, and the folders each covers
qa run                        # every set
qa run unit stories           # some sets, by name
qa run --level IU --report    # intended-use sets, with a PDF per set
qa run --changed              # only folders changed since origin/main, or not committed
qa run --dry-run              # print the commands
```

`qa` reads the nearest `qa.yaml` at or above the working directory, or the
file `--config` names. An example is in [examples/qa.yaml](examples/qa.yaml).

## What a Run Does

For each set and each package folder it covers, in file order:

1. **Builds the command.** The set's `command`, or the runner definition's.
   With the definition's command, `qa` adds the arguments that make the
   runner write JUnit XML into `qa-results/junit/`. Gradle and Maven write
   their own files, which `qa` reads where they land.
2. **Runs it in the package folder**, with the terminal's output. A
   qualification set gets `QUALIFY_EVIDENCE_DIR` (in `qa-results/evidence/`,
   or the set's `results`) and one `QUALIFY_RUN_ID` for the whole run.
3. **Reads the results.** JUnit XML for an ordinary set. For a qualification
   set, `qualify merge` builds the run file from the evidence, and with
   `--report`, `qualify report` draws the PDF into `qa-results/reports/`.
4. **Writes** `qa-results/junit.xml`, every JUnit report merged, with a
   failing entry for a set that left none, and `qa-results/summary.json`.

```text
FAIL  unit    libs/math  2 tests  1 failed  0 errors  0 skipped  0.0 s
pass  web-oq  apps/web   1 tests  0 failed  0 errors  0 skipped  0.1 s

1 of 2 failed
```

`qa-results/` is emptied at the start of each run. Add it to `.gitignore`.

## Options

| Option              | Default                           | What it does                                                          |
| ------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `SET...`            | every set                         | Run only the named sets                                               |
| `--level LEVEL`     | every level                       | Only sets of a level; repeat for several                              |
| `--changed`         | off                               | Only folders with a change since `--base`, or not yet committed       |
| `--base REF`        | `origin/main`                     | What `--changed` compares with                                        |
| `--report`          | off                               | A PDF per qualification set, with `qualify report`                    |
| `--dry-run`         | off                               | Print the commands and their variables, run nothing                   |
| `--out DIR`         | `qa-results`                      | Where the merged results and reports go, relative to `qa.yaml`        |
| `--qualify COMMAND` | `npx --yes @lekman/qualify@0.2.0` | How to run the qualify CLI, such as `uv run qualify` in a Python repo |
| `--config FILE`     | the nearest `qa.yaml`             | Which file to read                                                    |

| Exit code | Meaning                                                   |
| --------- | --------------------------------------------------------- |
| 0         | Every set passed                                          |
| 1         | A command failed, a test failed, or a set left no results |
| 2         | `qa.yaml` is missing or invalid, or a set cannot run      |
| 64        | Usage error                                               |

## What It Costs and What It Does Not Do

- **qualify is pinned.** `qa` runs qualify 0.2.0 through `npx` unless
  `--qualify` names another command, so a new qualify release does not change
  what an installed `qa` does. To use a newer qualify before `qa` moves its
  pin, pass `--qualify "npx --yes @lekman/qualify@<version>"`.
- **Sets run one after another.** A repository with many slow sets waits for
  each. Parallel runs are not built.
- **`--changed` is by folder.** A change anywhere in a package folder runs
  every set that covers it; a change outside every package folder runs only
  sets that cover the root.
- **A set's own command must write its results itself.** With `command`,
  `qa` adds no arguments; the command must leave JUnit XML at the set's
  `results`, or qualify evidence in `QUALIFY_EVIDENCE_DIR`.
- **`qualify merge` refuses mixed runs.** A qualification set whose
  `results` folder keeps records of earlier runs fails to merge. Without
  `results`, `qa` gives each run a clean folder.
- **The JUnit flags of each runner are taken from its documentation.** This
  release ran bun test and the qualify bun adapter end to end; the other
  runners' flags have not been run here yet.

## Layout

| Folder        | Holds                                                  |
| ------------- | ------------------------------------------------------ |
| `src/args/`   | The command line                                       |
| `src/plan/`   | Sets and folders into commands, with their variables   |
| `src/run/`    | Running the plan and reading its results, behind ports |
| `src/report/` | What `qa list` and `qa run` print                      |
| `src/system/` | The file system and process adapters                   |
| `src/cli/`    | The entry point                                        |
