---
status: completed
title: Migrate release prepare (gitflow) to Transaction
type: refactor
complexity: high
dependencies:
  - task_05
  - task_06
---

# Task 07: Migrate release prepare (gitflow) to Transaction

## Overview
Wrap the full `prepareRelease` flow (branch creation, gitignore mutation, notes write, plan write, and the embedded workspace version-bump from task_06) inside a `Transaction` so that a failure at any step rolls the repo back to its pre-prepare state. This eliminates the orphaned-branch hazard called out in ADR-004 §Context and makes retries deterministic.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST wrap each side-effectful step inside `prepareRelease` as a Transaction step with a compensating action: branch creation → `git branch -D`; gitignore mutation → revert original bytes; notes file write → `fs.unlink`; plan file write → `fs.unlink`.
- MUST write the release-plan file LAST so that a partial run never leaves a plan file referencing a half-prepared branch.
- MUST integrate the version-bump steps from task_06 into the same Transaction (they no longer run on their own when invoked from prepare).
- MUST acquire the repo lock via `acquireRepoLock` for the lifetime of the flow.
- MUST throw `GitwiseError({ code: "RELEASE_BRANCH_CONFLICT" })` when a pre-existing release branch blocks prepare and surface the rollback hint pointing at `docs/recovery.md`.
- MUST emit `ROLLBACK_PARTIAL` if any compensate fails AND still surface the original cause.
- MUST add integration tests that fail prepare deliberately AFTER branch creation, AFTER gitignore mutation, AFTER notes write, and AFTER plan write; each asserts end-state equality with the pre-prepare git state.
</requirements>

## Subtasks
- [x] 7.1 Identify all side-effectful steps in `prepareRelease` (`packages/core/src/commands/release.ts:264+`).
- [x] 7.2 Define one Step factory per side effect (branch, gitignore, notes, plan, plus integration of task_06 version-bump steps).
- [x] 7.3 Reorder writes so the release plan is the LAST step (per ADR-004 §Decision item 1).
- [x] 7.4 Wrap the entire flow in `acquireRepoLock` with try/catch/finally.
- [x] 7.5 Map known failures to `RELEASE_BRANCH_CONFLICT`, `RELEASE_PLAN_STALE`, `GIT_FAILED`, etc.
- [x] 7.6 Build integration test fixtures that simulate failure at each step boundary and assert full revert.

## Implementation Details
See TechSpec §Implementation Design and ADR-004 §Decision item 1 for the per-step compensate mapping. The plan-last ordering is explicit in ADR-004. Reuse the Step factories from task_06 for version propagation rather than duplicating logic. Reference the existing `prepareRelease` function at `packages/core/src/commands/release.ts:264` for the current control flow.

### Relevant Files
- `packages/core/src/commands/release.ts` — `prepareRelease()` at line 264; multi-step flow that needs full Transaction wrapping.
- `packages/core/src/infra/transaction.ts` / `lockfile.ts` — primitives from task_05.
- `packages/core/__tests__/release.test.ts` (or equivalent) — extended with failure-boundary fixtures.

### Dependent Files
- `docs/recovery.md` — task_17 documents what to do when prepare emits `ROLLBACK_PARTIAL`.
- `CONTRIBUTING.md` — task_17 documents the "how to add a transactional step" pattern using prepare as a worked example.

### Related ADRs
- [ADR-004: Transactional rollback for multi-step git workflows](../adrs/adr-004.md) — Implements §Decision item 1 and addresses ADR-004 §Context issue #1.
- [ADR-003: GitwiseError class with stable exit codes](../adrs/adr-003.md) — Reuses `RELEASE_BRANCH_CONFLICT` / `RELEASE_PLAN_STALE` / `GIT_FAILED` codes.

## Deliverables
- `prepareRelease` runs entirely inside a `Transaction` with per-step compensate.
- Plan-write happens last; prior steps are reverted in LIFO order on any failure.
- Repo lock guards the full flow.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests covering 4+ failure-boundary scenarios with end-state equality assertions **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] Each Step factory's `apply` and `compensate` are unit-tested independently.
  - [ ] Plan write is provably the last step (e.g., by inspecting transaction step order in a unit test).
  - [ ] `RELEASE_BRANCH_CONFLICT` is thrown when the target branch already exists.
- Integration tests:
  - [ ] Failure after branch creation: branch deleted, gitignore unchanged, plan absent.
  - [ ] Failure after gitignore mutation: branch deleted, gitignore reverted, plan absent.
  - [ ] Failure after notes write: notes file removed, gitignore reverted, branch deleted, plan absent.
  - [ ] Failure after plan write (e.g., the very last step throws): plan removed, all prior compensates fired.
  - [ ] Happy path: end state matches expected and includes the plan file as the marker of completion.
  - [ ] Compensate failure surfaces `ROLLBACK_PARTIAL` AND the original cause is still raised.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Failing `prepare` leaves the working tree byte-equal to the pre-prepare state for every fixture above
- Lockfile released in both success and failure paths
- `gw release prepare` no longer surfaces `STRATEGY_RELEASE_BRANCH_EXISTS` after a failed run (rollback prevents the orphan)
