---
status: completed
title: Migrate commit-split to Transaction with named stash compensate
type: refactor
complexity: high
dependencies:
  - task_05
---

# Task 08: Migrate commit-split to Transaction with named stash compensate

## Overview
Wrap the commit-split loop in `commands/commit.ts` inside a `Transaction` whose root compensating action is a named git stash of the pre-split working tree, plus per-commit compensates that `git reset --soft` the just-created commit. A mid-loop failure now restores the user's working tree intact and references the stash by a predictable name (`gitwise/split-<timestamp>`) so the recovery doc can guide manual recovery if needed.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST take a named git stash at the start of the flow tagged `gitwise/split-<ISO8601-timestamp>` as the root Transaction step, so that the pre-split working tree can always be restored.
- MUST add per-commit Transaction steps whose `apply` performs `git add` + `git commit` and whose `compensate` runs `git reset --soft <prior-HEAD>` to remove that commit while preserving the staged delta.
- MUST acquire the repo lock for the lifetime of the flow.
- MUST surface `GitwiseError({ code: "GIT_FAILED" })` (with stderr in `details`) when any underlying `git` call fails.
- MUST surface `code: "INVALID_INTENT"` (or the appropriate code) when the LLM-suggested commit plan is unparseable; do not enter the split loop with an invalid plan.
- MUST emit `ROLLBACK_PARTIAL` if stash pop or any `git reset --soft` fails, and `docs/recovery.md` (task_17) MUST reference the stash by its predictable name.
- MUST add integration tests that fail at i=0, i=middle, and i=last; assert pre-split working tree restored in every case.
- MUST NOT change LLM prompting or intent parsing in this task — pure rollback wrapper.
</requirements>

## Subtasks
- [x] 8.1 Locate the commit-split loop in `packages/core/src/commands/commit.ts:~290–310` and isolate the side-effectful section.
- [x] 8.2 Define a `takeNamedStashStep(timestamp)` Step whose compensate pops the named stash.
- [x] 8.3 Define a `applyOneCommitStep(plannedCommit)` Step that records the resulting SHA on apply and `git reset --soft` it on compensate.
- [x] 8.4 Wrap the loop in a Transaction; acquire repo lock; ensure release in `finally`.
- [x] 8.5 Add integration tests for i=0, middle, last failure boundaries.
- [x] 8.6 Verify the stash name format and document the convention so task_17 can reference it.

## Implementation Details
See TechSpec §Implementation Design and ADR-004 §Decision item 3 for the named-stash strategy. The current commit-split code at `commit.ts:290+` resets staging then iterates `git add` + `git commit` per planned commit; that loop becomes the Transaction body. Use a deterministic stash naming scheme so failures can be diagnosed by reading `git stash list`.

### Relevant Files
- `packages/core/src/commands/commit.ts` — commit-split loop at lines ~290–310.
- `packages/core/src/infra/git.ts` — wraps `git add` / `git commit` / `git reset` / `git stash`.
- `packages/core/src/infra/transaction.ts` / `lockfile.ts` — primitives from task_05.
- `packages/core/__tests__/commit.test.ts` (or equivalent) — extended with failure boundaries.

### Dependent Files
- `docs/recovery.md` — task_17 references the named-stash recovery procedure.
- `infra/git.ts` — may need a `gitStashPushNamed` helper if not already present.

### Related ADRs
- [ADR-004: Transactional rollback for multi-step git workflows](../adrs/adr-004.md) — Implements §Decision item 3.
- [ADR-003: GitwiseError class with stable exit codes](../adrs/adr-003.md) — Reuses `GIT_FAILED`, `INVALID_INTENT`, `ROLLBACK_PARTIAL`.

## Deliverables
- Commit-split runs inside a `Transaction` with a named-stash root step and per-commit reset compensates.
- Repo lock guards the full flow.
- Named stash convention (`gitwise/split-<timestamp>`) used and surfaced in logs.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for at least 3 failure boundaries (i=0, middle, last) **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `applyOneCommitStep.apply` records the new HEAD SHA on the result.
  - [x] `applyOneCommitStep.compensate` runs `git reset --soft <prior-SHA>`.
  - [x] `takeNamedStashStep.compensate` pops the named stash and not an arbitrary one.
  - [x] Stash name follows the documented `gitwise/split-<ISO8601>` format.
- Integration tests:
  - [x] Failure at i=0 (first commit fails): stash popped, working tree byte-equal to pre-split, no commits added.
  - [x] Failure at middle (e.g., 3 of 5 commits applied then fourth fails): commits 1–3 reset, stash popped, working tree restored.
  - [x] Failure at last (last commit fails): all prior commits reset, stash popped, working tree restored.
  - [x] Compensate failure (e.g., stash pop conflict) surfaces `ROLLBACK_PARTIAL` AND original `GIT_FAILED` is preserved; the stash is left in `git stash list` referenced by its predictable name.
  - [x] Happy path: all commits land in correct order; no stash remains in `git stash list`.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Pre-split working tree restored byte-for-byte in every failure scenario above
- Named stash convention documented and referenced in test assertions
- Lockfile released in both success and failure paths
