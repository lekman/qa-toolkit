# qat-001: Repository Scaffold

> **Status:** Dispatched | **Date:** 2026-09-06 | **Author:** planning session (Claude chat) | **Keys:** qat-001

## Context

`lekman/qa-toolkit` does not exist yet. It becomes the public home for the
operator's testing patterns and practices, alongside `lekman/ai-toolkit`
(practices for working with Claude) and the planned `lekman/devops-toolkit`.
This brief creates the repository and copies the ai-toolkit tooling so every
later package inherits one convention.

It gates qat-002. The package brief assumes a Bun workspace, ESLint, trunk,
commitlint, release-please and the `.claude/rules/` files are already in place
and CI is green.

## Already Done, Do Not Redo

Nothing. The repository, the workspace and every file below are new. The only
existing artefacts are the handoff documents themselves, which this brief
commits as part of the scaffold.

## Steps

### 1. Create the Repository

```bash
gh auth status                       # must be logged in as lekman
gh repo create lekman/qa-toolkit --public --license mit \
  --description "Testing patterns, practices and tools" --clone
cd qa-toolkit
git checkout -b chore/repo-scaffold
```

Expected: an empty public repository with `LICENSE` (MIT, Tobias Lekman) and
default branch `main`.

Clone the convention source next to it:

```bash
git clone --depth 1 https://github.com/lekman/ai-toolkit.git ../ai-toolkit
```

### 2. Copy Tooling from ai-toolkit Verbatim

Copy these paths from `../ai-toolkit/` unchanged:

| Path                                                        | Purpose                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `eslint.config.mjs`                                         | Flat config: `perfectionist` imports, `jsdoc` on exports |
| `commitlint.config.mjs`                                     | Conventional commits                                     |
| `.trunk/trunk.yaml`, `.trunk/.gitignore`, `.trunk/configs/` | Formatting, markdownlint, secret scanning, hook actions  |
| `.githooks/pre-commit`, `.githooks/commit-msg`              | Client-content guards                                    |
| `scripts/build.ts`                                          | Bun build targeting Node, bundling dependencies          |
| `scripts/release.ts`                                        | Maintainer publish script                                |
| `scripts/hooks.ts`                                          | Verifies hooks are live                                  |
| `scripts/install-hooks.sh`                                  | Sets `core.hooksPath`                                    |
| `scripts/check-no-client-content.sh`                        | The guard both hooks call                                |
| `scripts/client-terms.example.txt`                          | Template for the gitignored term list                    |
| `scripts/pre-commit-eslint.sh`                              | ESLint fix on staged files (trunk action)                |
| `scripts/README.md`                                         | Explains the above                                       |
| `.claude/settings.json`, `.claude/hooks/`                   | Denies `--no-verify`; tripwire on session start          |
| `.claude/rules/clean-architecture.md`                       | Module layout and DI rules                               |
| `.claude/rules/markdown.md`                                 | Link rules                                               |
| `.github/workflows/ci.yml`                                  | Lint, typecheck, test, build; trunk hold-the-line        |
| `.github/workflows/cd.yml`                                  | Release-please                                           |
| `.github/workflows/security.yml`                            | CodeQL and friends                                       |
| `.github/codeql-config.yml`                                 |                                                          |
| `.github/CODEOWNERS`                                        |                                                          |
| `.github/dependabot.yml`                                    | Includes the TypeScript 7 ignore; keep it                |
| `.github/pull_request_template.md`                          |                                                          |
| `.github/ISSUE_TEMPLATE/`                                   |                                                          |
| `.gitignore`                                                |                                                          |
| `mise.toml`                                                 |                                                          |

Do not copy: `.github/workflows/client-content.yml` (needs the `CLIENT_TERMS`
secret and fails without it; see day plan gap 4), `scripts/sync-app-credentials.ts`,
`.claude-plugin/`, `packages/`, `plugins/`, `standards/`, `security/`,
`privacy/`, `practices/`, `docs/`, `rules/`.

### 3. Adapt the Copied Files

Make these edits and no others:

- Replace every `ai-toolkit` with `qa-toolkit` in `.github/CODEOWNERS`,
  `.github/dependabot.yml` comments, `.trunk/trunk.yaml` comments,
  `scripts/README.md`, `.claude/hooks/` comments, and `.gitignore` comments.
- `.gitignore`: remove the `packages/rag/*` lines and the RAG runtime lines.
  Keep `packages/*/dist/` and `packages/*/LICENSE`.
- `.github/CODEOWNERS`: remove the `/packages/rag/*/CHANGELOG.md` line.
- `.github/workflows/ci.yml`: in the "Test all packages" step, remove
  `packages/rag/*/package.json` from the loop.
- `.trunk/trunk.yaml`: remove the `markdownlint` ignore for
  `packages/rag/*/tests/fixtures/**`. Keep the CHANGELOG ignore.
- `mise.toml`: keep `bun`, `node = "22"` and `trunk`. Remove `python`, `uv`,
  `awscli`, `azure-cli` and their comments.
- `eslint.config.mjs`: add `"perfectionist/sort-classes": "error"` to the
  rules block (day plan gap 2). If it produces errors the scaffold cannot
  satisfy, remove it again and record why in Outcome.
- `.github/dependabot.yml`: remove the `zod` ignore entry (no MCP SDK here).

### 4. Write Root Files

`package.json`:

```json
{
  "name": "@lekman/qa-toolkit",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "bun run --filter '*' build",
    "typecheck": "bun run --filter '*' typecheck",
    "test": "bun run --filter '*' test",
    "lint": "eslint .",
    "hooks": "bun run scripts/hooks.ts",
    "check": "bun run lint && bun run hooks && bun run --filter '*' check",
    "release": "bun run scripts/release.ts"
  },
  "devDependencies": {
    "@commitlint/cli": "^20.0.0",
    "@commitlint/config-conventional": "^20.0.0",
    "@eslint/js": "^10.0.1",
    "eslint": "^10.8.0",
    "eslint-plugin-jsdoc": "^64.1.0",
    "eslint-plugin-perfectionist": "^5.10.0",
    "typescript-eslint": "^8.65.0"
  }
}
```

Check `../ai-toolkit/package.json` and `../ai-toolkit/bun.lock` for the
commitlint versions actually in use and match them; the versions above are the
ai-toolkit root devDependencies as of 2026-09-06 plus a guess for commitlint.

`.github/release-config.json`: copy from ai-toolkit and keep exactly one
package entry, for `packages/data-sampler` with `package-name`
`@lekman/data-sampler` and `component` `data-sampler`. Keep the
`changelog-sections` block unchanged.

`.github/release-manifest.json`:

```json
{
  "packages/data-sampler": "0.1.0"
}
```

`README.md` (root). Reader: someone deciding whether any of this is for them.
Sections: one paragraph on what the toolkit is (testing patterns and practices,
the runnable half in `packages/`, the reasoning half in `practices/`); a
"Start Here" list with one entry, `packages/data-sampler/README.md`; a
"Related" list pointing at `docs/CONTRIBUTING.md` and the ai-toolkit
repository URL. Apply the writing rules in step 5.

`CLAUDE.md` (root). The shape of the repository for navigation, modelled on
ai-toolkit's:

```markdown
# qa-toolkit

My testing patterns and practices. The README covers the _why_; this file is
the _shape_, for navigation.

- `packages/`: runnable TypeScript, built with Bun, published for Node 20 or
  later with dependencies bundled unless a package README says otherwise.
- `practices/`: patterns and reasoning. Prose, not config. Each package pairs
  with one.
- `docs/`: contributing guide, cross-cutting notes, and `docs/handoff/` for
  dispatch briefs to implementation sessions.

The repo's own `.claude/` carries hooks, rules and `settings.json` that protect
this repo. Read `.claude/rules/` before writing code or markdown here.
```

`docs/CONTRIBUTING.md`: adapt from `../ai-toolkit/docs/CONTRIBUTING.md`.
Replace the "Where Things Go" table with `packages/`, `practices/`, `docs/`.
Keep the Writing section, the no-client-content section (drop the CI paragraph
since `client-content.yml` is not copied; say the hooks are local only for
now), and the tooling and release sections. Replace `standards/TONE.md` links
with a short inline list of the same rules: plain language, no empty
modifiers, no filler, UK English.

`packages/README.md`: one paragraph (built with Bun, published for Node) and a
table with one row for `data-sampler/` pointing at
`data-sampler/README.md`, with the practice column pointing at
`../practices/graded-test-data/README.md`. Both targets are created in
qat-002; the links are dangling until then, which is acceptable for one pull
request.

`practices/README.md`: one paragraph explaining that each practice is the
reasoning half of a package, and a table with one row for
`graded-test-data/` (dangling until qat-002).

Commit the handoff documents: `docs/handoff/README.md`,
`docs/handoff/2026-09-06/*.md` and `.claude/rules/handoff.md` as supplied by
the operator.

### 5. Writing Rules for Every Markdown File

- No em dash character anywhere in prose. Use a colon, comma, full stop or
  restructure.
- No empty modifiers: comprehensive, robust, seamless, powerful, detailed.
- Title case headings, at most three levels below the title.
- Every link points at a file, never a directory.
- No horizontal rules.
- UK English.

### 6. Create the Package Skeleton

CI's build and typecheck steps run `bun run --filter '*'`, which fails with
nothing to filter. Create the skeleton now so the scaffold pull request is
green; qat-002 fills it in.

`packages/data-sampler/package.json`:

```json
{
  "name": "@lekman/data-sampler",
  "version": "0.1.0",
  "description": "Classification-first JSON test data: define grades, choose a spread, generate records that satisfy each grade.",
  "license": "MIT",
  "author": "Tobias Lekman",
  "homepage": "https://github.com/lekman/qa-toolkit/tree/main/packages/data-sampler",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/lekman/qa-toolkit.git",
    "directory": "packages/data-sampler"
  },
  "keywords": ["faker", "test-data", "fixtures", "ndjson", "sampling"],
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "bun": "./src/index.ts",
      "default": "./dist/index.js"
    }
  },
  "bin": {
    "data-sampler": "./dist/cli.js"
  },
  "files": ["dist", "src", "README.md", "LICENSE"],
  "publishConfig": { "access": "public" },
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build": "bun run scripts/build.ts",
    "typecheck": "bun --bun tsc --noEmit",
    "test": "bun test",
    "check": "bun run typecheck && bun test && bun run build",
    "prepublishOnly": "bun run check"
  },
  "dependencies": {
    "@faker-js/faker": "^10.0.0"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "@types/node": "^26.2.0",
    "typescript": "^5.7.0"
  }
}
```

Check the current `@faker-js/faker` major on npm (`npm view @faker-js/faker
version`) and use that major. The planning session did not verify it.

`packages/data-sampler/tsconfig.json`: copy from
`../ai-toolkit/packages/rag/core/tsconfig.json` and set `include` to
`["src/**/*.ts", "tests/**/*.ts", "examples/**/*.ts"]`.

`packages/data-sampler/bunfig.toml`:

```toml
[test]
coverage = true
coverageThreshold = { line = 0.8, function = 0.6, statement = 0.8 }
coveragePathIgnorePatterns = [
  "**/*.system.ts",  # System wrappers, no business logic
  "**/index.ts",     # Barrel re-exports, no business logic
  "src/cli.ts",      # CLI entrypoint, wiring only
  "examples/**",
  "tests/**",
  "**/*.test.ts",
]
```

`packages/data-sampler/scripts/build.ts`: copy `../ai-toolkit/packages/rag/core/scripts/build.ts`
and set the entrypoints to `src/cli.ts` and `src/index.ts`, with
`external: ["@faker-js/faker"]` (decision D4). Make the CLI output executable
as the root `scripts/build.ts` does.

`packages/data-sampler/src/index.ts`: `export {};` with a one-line comment
"Filled in by qat-002."

`packages/data-sampler/src/cli.ts`: shebang `#!/usr/bin/env node`, a JSDoc
block, and `process.stdout.write("data-sampler: not yet implemented\n");`.

`packages/data-sampler/tests/placeholder.test.ts`: one passing `bun:test`
test so the CI test loop has something to run. Delete it in qat-002.

`packages/data-sampler/.gitignore`: `dist/` and `LICENSE` (the build copies
the root licence in; ai-toolkit ignores the per-package copy).

`packages/data-sampler/README.md`: title and one sentence, "Filled in by
qat-002."

### 7. Install, Verify, Commit

```bash
mise trust && mise install
bun install
scripts/install-hooks.sh          # creates scripts/client-terms.txt from the example
bun run lint
bun run typecheck
bun run test
bun run build
bun run hooks
trunk check --all
```

Expected: every command exits 0. `bun run build` produces
`packages/data-sampler/dist/cli.js` and `dist/index.js`. `bun run hooks`
reports both guards live.

Commit in logical groups with conventional messages, for example:

```text
chore(repo): add workspace, lint, trunk and commit conventions
chore(repo): add CI, release-please and security workflows
chore(data-sampler): add package skeleton
docs(repo): add README, contributing guide and handoff contract
```

Push and open a pull request titled `chore(repo): scaffold repository`.
Wait for `Continuous Integration` to pass. The operator merges.

## Failure Interpretation

| Symptom                                                     | Meaning                                                                            | Action                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `typescript-eslint does not support TS 7.0`                 | A `typescript` devDependency resolved to 7.x                                       | Pin `^5.7.0` in the package that drifted; not a lint bug                      |
| `bun run --filter '*' build` reports no matching workspaces | Package skeleton missing or `workspaces` wrong                                     | Check step 6 and root `package.json`                                          |
| Trunk hold-the-line fails on copied files                   | Prettier or markdownlint differences from the copy                                 | Run `trunk fmt` and re-commit; not a logic problem                            |
| `perfectionist/sort-classes` errors in skeleton files       | Rule added in step 3 is stricter than the copied code                              | Fix order if trivial; otherwise remove the rule and record in Outcome         |
| `cd.yml` fails after merge with a permissions error         | Neither GitHub App secrets nor the repository setting is in place (day plan gap 3) | Surface to the operator; do not edit the workflow to work around it           |
| `bun run hooks` says a guard is inert                       | Trunk claimed `core.hooksPath`; `.githooks` is not being called                    | Expected on a fresh clone when trunk runs first; trunk's own actions cover it |
| Commit rejected by commitlint                               | Message not conventional                                                           | Rewrite the message; never `--no-verify`                                      |

## Outcome

_Empty at dispatch. The implementation session fills in: date, pull request
URL, deviations from the steps, and any decision taken on day plan gaps 2, 3
and 4._
