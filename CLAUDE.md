# qa-toolkit

My testing patterns and practices. The README covers the _why_; this file is
the _shape_, for navigation.

- `packages/`: runnable tools. TypeScript packages are built with Bun and
  published for Node 20 or later, with dependencies bundled unless a package
  README says otherwise. Python, Java and .NET packages sit beside them, each
  with its own build file.
- `spec/`: contracts shared by packages in several languages. A spec is
  normative; change it first, in its own pull request, then the packages.
- `practices/`: patterns and reasoning. Prose, not config. Each package pairs
  with one.
- `docs/`: contributing guide, cross-cutting notes, and `docs/handoff/` for
  dispatch briefs to implementation sessions.

The repo's own `.claude/` carries hooks, rules and `settings.json` that protect
this repo. Read `.claude/rules/` before writing code or markdown here.
