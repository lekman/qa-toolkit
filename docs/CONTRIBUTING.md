# Contributing

How to work in this repo. Consumer documentation lives in each folder's
`README.md`; anything that assumes you have the repo checked out belongs here or
in a package's own `README.md`.

## Where Things Go

The top level is flat and grouped by how each thing is consumed. [CLAUDE.md](../CLAUDE.md)
is the navigation map; the short version:

| Folder       | For                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `packages/`  | Runnable tools: CLIs and libraries. TypeScript built with Bun, plus Python, Java and .NET packages. |
| `practices/` | The reasoning behind each package. Prose, not config.                                               |
| `spec/`      | Contracts that more than one package implements: schemas and conformance scenarios.                 |
| `docs/`      | The contributing guide, cross-cutting notes and handoff briefs.                                     |

If a change is guidance, it goes in `practices/`. If it is something you install
and run, it goes in `packages/`. If several packages in different languages must
agree on it, it goes in `spec/`, and the packages follow. If it explains _why_
across several of those, or is a dispatch brief for an implementation session,
it goes in `docs/`.

Every folder carries its own `README.md`. Add one when you add a folder.

## Writing

The rules apply to the documentation as much as to the code:

- Plain language. Assume the reader does not have English as a first language.
- No empty modifiers: comprehensive, robust, seamless, powerful, detailed.
- No filler agreement and no filler prose.
- UK English.
- [.claude/rules/markdown.md](../.claude/rules/markdown.md): every link points
  at a **file**, never a bare directory. `[packages](packages/)` breaks silently
  when files move; `[packages/README.md](packages/README.md)` does not.

Say what something costs, not only what it does. A README that lists benefits and
omits the trade is not finished.

### No Client-Identifying Content, in Files or Messages

The repo is public. Client names, their repository names, ticket keys, internal
system names and meeting titles never appear in it, in either the files or the
commit messages. Examples use placeholders (Acme, Globex, PROJ-123).

Messages matter as much as files and are worse to get wrong: they travel into
pull request titles, notifications and release notes, and a changelog generator
turns them into a shipped artefact. Describe the shape of the change instead of
the party it came from.

```text
bad   fix(data-sampler): stop generating Acme Ltd records
good  fix(data-sampler): stop generating records for an excluded grade
```

Enforced locally, by the `pre-commit` and `commit-msg` hooks in `.githooks/`.
Install them once per clone with `scripts/install-hooks.sh`. The guard reads
a gitignored term list and skips when there is none, so a contributor with no
list is never blocked.

CI runs the same guard as a backstop, in the `leak-guard` job of
[ci.yml](../.github/workflows/ci.yml). It catches a commit made without the
hooks. It scans the working tree on every pull request and push to `main`, and
on a pull request it also scans the message of every commit the pull request
adds. The Quality Gate requires it to pass.

The job reads its term list from the `CLIENT_TERMS` repository secret. The
secret holds the same newline-separated regex list as your local
`scripts/client-terms.txt`. The repository owner sets it:

```bash
gh secret set CLIENT_TERMS -R lekman/qa-toolkit < scripts/client-terms.txt
```

Set it again whenever the local list changes. A term missing from the secret is
a term CI lets through.

The job fails when the secret is empty, so a missing list cannot pass as a
clean scan. Two cases are exempt, because GitHub does not pass the secret to
them: pull requests from a fork, and runs Dependabot starts. They warn and pass
instead. To cover Dependabot too, set the same value as a Dependabot secret
with `gh secret set CLIENT_TERMS --app dependabot -R lekman/qa-toolkit`.

CI logs are public for this repository. The job runs the guard with `--quiet`,
which reports file paths and commit SHAs only, never the term or the matching
line. To see what matched, run the guard locally without `--quiet`.

Audit what is already committed:

```bash
scripts/check-no-client-content.sh --history    # file content, every blob
scripts/check-no-client-content.sh --messages   # every commit message
```

A working tree going clean does not clean the history behind it: a fix commit
corrects the tip and leaves the earlier blob published.

## Commits

Conventional commits, enforced by commitlint ([config](../commitlint.config.mjs)).

```text
feat(data-sampler): add the spread allocator
docs(practices): add the graded-test-data practice
chore(repo): pin the trunk version
```

Scope is the package or `repo`. Use `!` and a `BREAKING CHANGE:` footer when a
published interface changes.

Group related work into one commit and unrelated work into separate ones: a
commit that touches a package and rewrites an unrelated practice is two commits.

## Branches and Pull Requests

Work on a branch, never on `main`. Open a pull request even when working alone:
the PR body is where the reasoning lives once the diff stops explaining itself.

```bash
git checkout -b feat/short-description
# ...
gh pr create --fill
```

State in the PR what you did **not** test. Unverified work described as done is
worse than work described as unverified.

## Tooling

Development tools are pinned per directory in [mise.toml](../mise.toml):

```bash
mise trust && mise install
```

That gets you Bun and Node for the packages and Trunk for linting. None of it is
needed to _use_ what this repo publishes. A released CLI runs under plain Node
20 or later.

## Linting

[Trunk](https://trunk.io) runs on every commit through the git hooks and on
every pull request in CI, so a problem is caught before it is pushed.
Configuration is in [.trunk/trunk.yaml](../.trunk/trunk.yaml), with linter
settings in `.trunk/configs/` and shared editor settings in
[.editorconfig](../.editorconfig).

| Area            | Linters                                                            |
| --------------- | ------------------------------------------------------------------ |
| Every file      | gitleaks, trufflehog, a diff check, osv-scanner for lockfiles      |
| Markdown, JSON  | prettier, markdownlint                                             |
| YAML, workflows | yamllint, actionlint                                               |
| Shell scripts   | shellcheck, with its default checks                                |
| Python          | ruff                                                               |
| Kotlin          | ktlint (official style), detekt (default rules, any finding fails) |
| Java            | google-java-format                                                 |

commitlint and the client-content guard run as Trunk actions.

Trunk covers formatting and quick static checks. Each package's own build
enforces the rest of the standard and fails on any violation: type checks
(TypeScript, mypy), Error Prone and NullAway for Java, the .NET analyzers and
`dotnet format` for C#, and a coverage floor of 80% of lines in every
language. C# formatting is checked by the .NET build, not by Trunk, because
Trunk's `dotnet-format` needs a .NET SDK on the path. A package build and
Trunk must agree: when a package pins ktlint or google-java-format in its
build, it pins the version Trunk uses.

```bash
trunk check          # lint the diff
trunk fmt            # format
```

If `trunk` is not installed, formatting still matters: prettier's defaults are
what the repo is checked against.

## Packages

Everything under `packages/` is TypeScript, built with [Bun](https://bun.sh), and
published for Node. Dependencies are bundled into the build unless a package
README says otherwise, so a published CLI usually has no runtime dependencies
and a cold `npx` installs nothing. Bun is a build-time tool, never a
requirement for users.

That has one consequence worth stating plainly, because it compiles cleanly and
fails at the worst moment: **`src/` may use Node APIs only.** A `Bun.*` call
builds fine, ships fine, and then crashes for every user who does not have Bun.

Each package carries its own `README.md` with its layout and whatever is
specific to it.

### Releasing

Releases are cut by release-please and published by CI, with no npm token
anywhere:

1. A `feat` or `fix` commit lands on `main`. `cd.yml` runs release-please,
   which opens or updates the release pull request with the version bump and
   changelog.
2. Merging that pull request creates the tag and the GitHub release. The same
   workflow run then publishes every released package with npm
   [trusted publishing](https://docs.npmjs.com/trusted-publishers/): the job's
   OIDC token proves it is `cd.yml` in this repository, which is the publisher
   configured on the package at npmjs.com, and npm attaches provenance on its
   own.

The trusted publisher is bound to the workflow filename. Renaming `cd.yml`
stops publishing until the connection is deleted and recreated on npmjs.com.

`scripts/release.ts` remains for a publish from a maintainer's machine with
browser-based `npm login`, for example to recover a tag that was created but
never published. A laptop cannot produce provenance, so prefer the CI path.
