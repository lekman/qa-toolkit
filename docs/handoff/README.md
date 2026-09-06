# Handoff

Dispatch documents that let a Claude Code session execute planned work without
the planning conversation. The brief is the only channel: anything not written
in it is lost.

## Layout

```text
docs/handoff/
  README.md                      This index
  YYYY-MM-DD/                    One folder per dispatch day
    00-day-plan.md               Ordering, gates and handling rules for the day
    {key}-{slug}.md              One self-contained brief per work unit
```

One brief maps to one branch and one pull request. Read the day plan first,
then the assigned brief. The contract every document follows is in
[.claude/rules/handoff.md](../../.claude/rules/handoff.md).

## Days

| Day                                     | Goal                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| [2026-09-06](2026-09-06/00-day-plan.md) | Scaffold the repository and ship `@lekman/data-sampler` v0.1 |

## Keys

This repository has no ticket tracker. Briefs use sequential keys `qat-NNN`
(qa-toolkit). The Outcome section of each brief is the evidence record.
