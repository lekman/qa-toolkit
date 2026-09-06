---
paths:
  - "docs/handoff/**"
---

# Handoff Contract

Planning happens in one session; implementation happens in another with no
shared context. These rules make the dispatch documents under `docs/handoff/`
executable on their own.

## Layout

```text
docs/handoff/
  README.md                      Index and flow description
  YYYY-MM-DD/                    One folder per dispatch day
    00-day-plan.md               Ordering, gates and handling rules for the day
    {key}-{slug}.md              One self-contained brief per work unit
```

One brief maps to one work unit: one branch, one pull request. A brief may
cover several keys when they form a single connected run that would be
artificial to split. Prefer fewer, connected briefs over many fragmented ones.

## Status Lifecycle

Every document starts with a status header:

```markdown
> **Status:** Dispatched | **Date:** YYYY-MM-DD | **Author:** planning session | **Keys:** qat-001
```

Statuses: Draft (being written), Dispatched (ready to execute), Consumed
(executed, Outcome filled), Archived (history only, may be stale). Never move
to Consumed with an empty Outcome. When creating a new day folder, roll
still-Dispatched briefs forward or mark them Archived.

## Brief Format

Required sections, in order:

1. **Status header**, as above.
2. **Context**: why the work exists and what it gates. Two paragraphs maximum.
3. **Already Done, Do Not Redo**: merged pull requests, published packages,
   fixes the plan may not reflect. This section prevents the most expensive
   failure: re-implementing finished work.
4. **Steps**: ordered, concrete, with expected results. Inline every identifier
   the reader needs (paths, URLs, commands); the reader has no other source.
5. **Failure Interpretation**: how to tell an environment problem from a code
   defect, where known in advance.
6. **Outcome**: empty at dispatch. The implementation session fills it: date,
   observations, evidence links (pull request), deviations from the steps.

## Staleness

All session state in a brief (pull request state, published versions, secrets
present) is a snapshot from the header date. Verify it before trusting it.
Write briefs in third person ("the planning session could not verify X"),
never first person; the document outlives the session that wrote it.

## Consuming a Brief

1. Read the day plan first for ordering and gates, then the assigned brief.
2. Verify all session-state claims before acting on them.
3. Respect "Already Done, Do Not Redo" absolutely; verify rather than
   re-implement.
4. Work the brief on its own branch and pull request.
5. Fill the Outcome section and set Status to Consumed in the same pull request
   as the work, or a follow-up commit.
6. If a hard gate fails, stop, record the finding in Outcome, and surface it to
   the operator rather than improvising around the gate.
