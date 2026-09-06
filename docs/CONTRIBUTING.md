# Contributing

How to work in this repo. Consumer documentation lives in each folder's
`README.md`; anything that assumes you have the repo checked out belongs here or
in a package's own `README.md`.

## Where Things Go

The top level is flat and grouped by how each thing is consumed. [CLAUDE.md](../CLAUDE.md)
is the navigation map; the short version:

| Folder       | For                                                             |
| ------------ | --------------------------------------------------------------- |
| `packages/`  | Runnable TypeScript: CLIs and libraries, built with Bun.        |
| `practices/` | The reasoning behind each package. Prose, not config.           |
| `docs/`      | The contributing guide, cross-cutting notes and handoff briefs. |

If a change is guidance, it goes in `practices/`. If it is something you install
and run, it goes in `packages/`. If it explains _why_ across several of those,
or is a dispatch brief for an implementation session, it goes in `docs/`.

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
list is never blocked. There is no CI check: this repository does not carry a
term list, so a secret-backed workflow would have nothing to match on.

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

[Trunk](https://trunk.io) runs markdownlint, prettier, gitleaks, trufflehog, and
a diff check, with commitlint as an action. Configuration is in
[.trunk/trunk.yaml](../.trunk/trunk.yaml).

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

Packages publish from a maintainer's machine with browser-based `npm login`, not
a token. npm revoked classic tokens in early 2026 and write-enabled granular
tokens now expire in days, so a long-lived local token is not something you can
have. Release from CI with
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) if you want
provenance attestations, which cannot be produced from a laptop.
