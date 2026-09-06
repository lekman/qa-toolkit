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
