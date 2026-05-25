---
status: completed
title: Migrate workspace version propagation to Transaction
type: refactor
complexity: medium
dependencies:
  - task_05
---

# Task 06: Migrate workspace version propagation to Transaction

## Overview
Convert the workspace-version-bump loop in `release.ts` into Transaction steps so that a write failure on `packages[N]/package.json` reliably restores the bytes of every previously-written `package.json`. This is the smallest of the three Transaction migrations and per ADR-004 §Implementation Notes is the first to land — it validates the primitive on a low-risk surface before the harder release-prepare migration in task_07.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST wrap each per-workspace `package.json` write in a Transaction step whose `apply` writes the new version and whose `compensate` restores the prior file bytes captured at apply time.
- MUST keep writes sequential (not concurrent) so ordering is deterministic — see ADR-004 §Decision.
- MUST acquire a repo lock via `acquireRepoLock` at the start of the flow and release it in a `finally` block.
- MUST throw `GitwiseError({ code: "GIT_FAILED" | "REPO_STATE_INVALID" | ... })` on any failure and trigger `Transaction.rollback` before propagating.
- MUST capture the prior bytes (not just JSON) so trailing newlines and formatting are preserved exactly on rollback.
- MUST emit a single `ROLLBACK_PARTIAL` warning (not per-step) if any compensate fails.
- MUST cover the migrated path with an integration test that simulates a write failure on the second of three workspaces and asserts the first is reverted.
</requirements>

## Subtasks
- [x] 6.1 Identify the version-propagation loop in `packages/core/src/commands/release.ts` (TechSpec references lines ~1100–1150 area) and isolate it from surrounding logic.
- [x] 6.2 Define a `writeWorkspaceVersionStep(pkgPath, newVersion)` Step factory that captures prior bytes in `apply` and restores them in `compensate`.
- [x] 6.3 Replace the existing loop with `await tx.run(writeWorkspaceVersionStep(...))` per workspace.
- [x] 6.4 Acquire the repo lock around the entire flow and ensure release on both success and failure paths.
- [x] 6.5 Update existing tests to cover the rollback boundary and lock-release behavior.

## Implementation Details
See TechSpec §Implementation Design for the Step interface and ADR-004 §Decision item 2 for the workspace-bump pattern. The TechSpec build order places this before release-prepare migration since the prepare flow itself calls into version propagation. Reuse the logger pattern already present in `release.ts`.

### Relevant Files
- `packages/core/src/commands/release.ts` — current sequential `package.json` write loop.
- `packages/core/src/infra/transaction.ts` — built in task_05.
- `packages/core/src/infra/lockfile.ts` — built in task_05.
- `packages/core/__tests__/release.test.ts` (or equivalent) — extend with rollback fixtures.

### Dependent Files
- `packages/core/src/commands/release.ts` — task_07 will further wrap this code inside a larger prepare Transaction.
- `docs/recovery.md` — task_17 references the recovery path when this flow's compensate partially fails.

### Related ADRs
- [ADR-004: Transactional rollback for multi-step git workflows](../adrs/adr-004.md) — Implements §Decision item 2.

## Deliverables
- Workspace version propagation runs inside a `Transaction` with per-`package.json` compensate steps.
- Repo lock acquired and released around the flow.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test simulating mid-loop failure and asserting full revert **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `writeWorkspaceVersionStep.apply` writes the new version and the file matches `JSON.stringify(updated)`.
  - [x] `writeWorkspaceVersionStep.compensate` restores byte-for-byte content captured at apply time.
  - [x] Sequential ordering preserved across 3 mock workspaces.
- Integration tests:
  - [x] 3 fixture workspaces: simulate write failure on the second; assert workspaces[0]/package.json is reverted and workspaces[2] was never written.
  - [x] Repo lock is held during the entire flow and released after both success and failure.
  - [x] A concurrent invocation while the flow holds the lock fails fast with `REPO_LOCKED`.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Mid-loop failure leaves all `package.json` files at their pre-flow contents
- Lock is released in both success and failure paths (verified by tests)
