# Day Plan: Scaffold qa-toolkit and Ship data-sampler

> **Status:** Dispatched | **Date:** 2026-09-06 | **Author:** planning session (Claude chat) | **Keys:** qat-001, qat-002

## Goal

Create the public repository `lekman/qa-toolkit` (MIT) as the home for testing
patterns and practices, in the same shape as `lekman/ai-toolkit`, and ship the
first package: `@lekman/data-sampler`, a classification-first JSON test data
generator built on `@faker-js/faker`.

By the end of the day: repository exists with green CI, one merged scaffold
pull request, one merged package pull request, and `bunx @lekman/data-sampler`
runnable from a local build. Publishing to npm is out of scope for the day.

## Reader

A Claude Code session with no other context, working in a fresh clone. The
operator is the repository owner and can add secrets, approve pull requests,
and run `npm login`.

## Convention Source

The repository copies its tooling from `lekman/ai-toolkit`
(<https://github.com/lekman/ai-toolkit>), not from `lekman/mmd`. The two differ:
`ai-toolkit` uses ESLint with `perfectionist` and `jsdoc`, static classes with
barrels, trunk, and a Bun workspace; `mmd` uses Biome and loose function
exports. `ai-toolkit` is the monorepo model the operator named, and it carries
the explicit rule file `.claude/rules/clean-architecture.md`. Where the two
conflict, `ai-toolkit` wins.

Every session working in this repository reads these files first:

- `.claude/rules/clean-architecture.md` (copied from ai-toolkit): module
  layout, `*.system.ts` naming, static classes, dependency injection.
- `.claude/rules/markdown.md` (copied from ai-toolkit): links point at files.
- `.claude/rules/handoff.md`: this contract.

## Decisions Already Made

These were settled in planning. Do not reopen them in the implementation
session; record disagreement in Outcome instead.

| #   | Decision                                                                                                                    | Reason                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Tooling is copied from ai-toolkit: Bun workspace, ESLint flat config, trunk, commitlint, release-please, `scripts/build.ts` | One convention across the toolkits. No Biome, no commander, no Taskfile.                                                            |
| D2  | TypeScript pinned to `^5.7.0`, never 7.x                                                                                    | `typescript-eslint` refuses to load under TypeScript 7; ai-toolkit's dependabot config documents this.                              |
| D3  | Build with Bun, publish for Node 20 or later                                                                                | Same as every ai-toolkit package. Bun is a build tool, not a user requirement.                                                      |
| D4  | `@faker-js/faker` is a runtime `dependency`, marked external in the bundle                                                  | The library entry must share one faker instance and version with the consumer's own tests; bundling it would duplicate the module.  |
| D5  | Grade is chosen per record first; field generators receive the grade                                                        | Classification-first generation is what makes the output assertable. Values that satisfy a grade, not values graded after the fact. |
| D6  | Spread allocation is exact (largest remainder), then a seeded shuffle                                                       | 1000 records at 90/10 must yield exactly 900/100 so integration tests can assert counts. Probabilistic sampling is a later opt-in.  |
| D7  | Dataset definitions are TypeScript modules with a default export                                                            | Generators are functions. A JSON dialect for functions is a second language nobody asked for.                                       |
| D8  | CLI argument parsing uses `node:util` `parseArgs`                                                                           | Zero dependencies, present in Node 20. Matches ai-toolkit's hand-rolled CLIs.                                                       |
| D9  | Every record carries `_meta: { grade, seed, index }` unless `--no-meta`                                                     | Tests need to know which grade produced a record. Base loads strip it.                                                              |
| D10 | Test runner is `bun:test` with coverage thresholds line 0.8, statement 0.8, function 0.6                                    | The operator's existing thresholds in `mmd`. A testing toolkit that enforces none would be odd.                                     |

## Dependency Spine

```text
qat-001 repo scaffold  ──gates──▶  qat-002 data-sampler
```

`qat-002` cannot start until `qat-001` is merged and CI is green on `main`.
The package brief assumes the workspace, ESLint, trunk and release-please
configuration exist.

## Ordering

| Order | Brief                                                | Branch                | Gate to proceed                                          |
| ----- | ---------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| 1     | [qat-001-repo-scaffold.md](qat-001-repo-scaffold.md) | `chore/repo-scaffold` | Pull request merged; `Continuous Integration` green      |
| 2     | [qat-002-data-sampler.md](qat-002-data-sampler.md)   | `feat/data-sampler`   | Pull request merged; `bun test` and `bun run build` pass |

## Handling Rules for the Day

- No ticket tracker. The brief's Outcome section is the record. Fill it in the
  same pull request as the work.
- Conventional commits, enforced by commitlint. Scope is the package or `repo`:
  `chore(repo): ...`, `feat(data-sampler): ...`.
- No client-identifying content in files or commit messages. The repository is
  public. Example data uses placeholder names only.
- Do not bypass hooks. `.claude/settings.json` denies `--no-verify`.
- Do not publish to npm. `scripts/release.ts` exists for the operator.

## Gaps and Risks

Confidence levels: High (verified in the ai-toolkit checkout on 2026-09-06),
Medium (reasonable inference), Low (untested).

1. **devops-toolkit is not published** (High). ai-toolkit's `ci.yml` is
   self-contained for that reason. Copy it as is; do not reference a reusable
   workflow.
2. **`perfectionist/sort-classes` is documented but not enabled** (High). The
   copied `clean-architecture.md` says the rule enforces static method order;
   the copied `eslint.config.mjs` does not enable it. Recommendation (Medium):
   enable it as `error` in qat-001 so the rule file is true. If it fights the
   scaffold, leave it off and record that in Outcome.
3. **Release-please needs either GitHub App secrets or a repository setting**
   (Medium). `cd.yml` prefers `vars.APP_ID` and `secrets.APP_PRIVATE_KEY` and
   falls back to `GITHUB_TOKEN`, which needs "Allow GitHub Actions to create
   and approve pull requests" enabled. The planning session could not verify
   which the operator will use for this repository. The first `cd.yml` run
   after merge to `main` will show which path is active; a failure there is a
   settings gap, not a code defect.
4. **`client-content.yml` fails the job when the `CLIENT_TERMS` secret is
   missing** (High, by design in ai-toolkit). Either the operator adds the
   secret before the first pull request, or qat-001 omits that workflow and
   keeps only the local hooks. The brief takes the second path and records it;
   the operator can add the workflow later.
5. **Datasets written in `.ts` need a runtime that strips types** (Medium).
   The CLI imports the dataset module with dynamic `import()`. Under Bun this
   works. Under Node it works from 22.6 with `--experimental-strip-types` and
   from 23.6 by default. The README documents this; no loader is added.
6. **Patient bands are illustrative, not clinical reference** (High). The
   example dataset exists to show four grades that a validator can tell
   apart. The README says so.
7. **Faker upgrades change generated values for the same seed** (High). The
   integration test pins one record by value. When dependabot bumps
   `@faker-js/faker`, that test fails on purpose; regenerate the expected
   record in the same pull request and say so in the commit body.
8. **Statistical test on `Distribution.normal`** (High that it is
   deterministic). It runs with a fixed seed, so it cannot flake. Its
   tolerance is loose (mean within 0.05, standard deviation within 0.05 over
   10,000 samples). A failure there after a faker upgrade means the random
   source changed, not the mathematics.
9. **npm scope `@lekman`** (Medium). The operator publishes other packages
   under it, so the name `@lekman/data-sampler` is assumed available. Not
   verified.
