---
status: completed
title: Implement Transaction primitive and advisory lockfile
type: backend
complexity: high
dependencies:
  - task_01
---

# Task 05: Implement Transaction primitive and advisory lockfile

## Overview
Build the shared `Transaction` class (apply/compensate steps with LIFO rollback) and the advisory `.gitwise/.lock` file primitive. These two primitives are the foundation of every multi-step git flow migration in tasks 06–08 and the mitigation for the "concurrent invocation corrupts repo" risk identified in ADR-004.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/core/src/infra/transaction.ts` exporting a `Transaction` class with a `run<T>(step: Step<T>): Promise<T>` method and a `rollback(reason: GitwiseError, logger: Logger): Promise<void>` method that runs compensates in LIFO order.
- MUST log (not throw) failures inside individual compensate calls, attribute them as `compensate-failed` with the step name, and emit a `code: "ROLLBACK_PARTIAL"` warning once rollback completes if any compensate failed.
- MUST surface the original `GitwiseError` from any flow even when rollback emits `ROLLBACK_PARTIAL` — rollback failures do not mask the root cause.
- MUST create `packages/core/src/infra/lockfile.ts` exporting `acquireRepoLock(repoPath: string): Promise<() => Promise<void>>` that writes `{ pid, host, command, acquiredAt }` to `.gitwise/.lock` and returns a release closure.
- MUST detect stale locks: if the existing lock's PID is not alive OR `acquiredAt` is older than 10 minutes, reclaim it.
- MUST throw `GitwiseError({ code: "REPO_LOCKED" })` (exit code 80) when a live lock is held by another process.
- MUST clean up the lockfile on release even if the operation failed.
- MUST NOT migrate any flow in this task — that is tasks 06–08.
- SHOULD make the compensate-action capture lazy (do not materialize state unless a compensate would need it) per ADR-004 §Risks.
</requirements>

## Subtasks
- [x] 5.1 Implement the `Transaction` class with `apply`-then-record semantics and LIFO `rollback`.
- [x] 5.2 Implement structured logging of `compensate-failed` events including step name and underlying error.
- [x] 5.3 Implement the `acquireRepoLock` flow including stale-lock detection (PID liveness + 10-minute window).
- [x] 5.4 Implement the lock-release closure with cleanup-on-error guarantees.
- [x] 5.5 Wire `REPO_LOCKED` and `ROLLBACK_PARTIAL` into `EXIT_CODES` (if not already added in task_01) and confirm parity test still passes.
- [x] 5.6 Add unit tests covering apply, rollback, partial-compensate failure, lock acquire/release, stale reclaim, and live-lock rejection.

## Implementation Details
See TechSpec §Implementation Design for the `Transaction` and `acquireRepoLock` signatures and ADR-004 §Decision/§Implementation Notes for behavioral details. The lockfile payload is documented in TechSpec §Data Models. PID-liveness check on POSIX uses `process.kill(pid, 0)` semantics — wrap to handle `ESRCH` and `EPERM` correctly. Logger interface should match what's already used in core (look at `infra/git.ts` for the current logger pattern).

### Relevant Files
- `packages/core/src/infra/transaction.ts` — NEW. Transaction primitive.
- `packages/core/src/infra/lockfile.ts` — NEW. Advisory lock.
- `packages/core/src/errors.ts` — read-only consumer (built in task_01).
- `packages/core/src/index.ts` — re-export new primitives for consumers.
- `packages/core/__tests__/transaction.test.ts` — NEW.
- `packages/core/__tests__/lockfile.test.ts` — NEW.

### Dependent Files
- `packages/core/src/commands/release.ts` — tasks 06 and 07 will adopt the primitive.
- `packages/core/src/commands/commit.ts` — task 08 will adopt the primitive.
- `CONTRIBUTING.md` — task_17 will document the "how to write a transactional flow" pattern.

### Related ADRs
- [ADR-004: Transactional rollback for multi-step git workflows](../adrs/adr-004.md) — This task implements the primitive that ADR-004 mandates.

## Deliverables
- `packages/core/src/infra/transaction.ts` with `Transaction` class and `Step<T>` type.
- `packages/core/src/infra/lockfile.ts` with `acquireRepoLock` and release closure.
- Updated package barrel re-exports.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for stale-lock reclaim and concurrent-invocation rejection **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `Transaction.run` returns the apply result and records the step.
  - [ ] `Transaction.rollback` invokes compensates in reverse order (LIFO).
  - [ ] A compensate that throws is logged (not re-thrown) and rollback continues.
  - [ ] After any compensate failure, the caller can observe `ROLLBACK_PARTIAL` (e.g., via the logger or a returned flag).
  - [ ] `acquireRepoLock` writes `.gitwise/.lock` with `{ pid, host, command, acquiredAt }`.
  - [ ] Calling `acquireRepoLock` while a live lock exists throws `GitwiseError({ code: "REPO_LOCKED" })`.
  - [ ] A lock with a dead PID is reclaimed without throwing.
  - [ ] A lock older than 10 minutes is reclaimed even if its PID is alive (configurable for test).
  - [ ] The release closure removes the lockfile on success.
  - [ ] The release closure removes the lockfile when the calling flow throws.
- Integration tests:
  - [ ] Spawn two `acquireRepoLock` calls in parallel; the second fails with `REPO_LOCKED`.
  - [ ] Simulate a stale lock by writing an old `.gitwise/.lock` with a dead PID; new acquire succeeds and overwrites it.
  - [ ] Build a 3-step Transaction; deliberately fail step 3 and assert compensates 2 then 1 ran.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `Transaction` and `acquireRepoLock` exported and consumable from `@denisvieiradev/gitwise-core`
- No existing flow is migrated yet (verified by grep — tasks 06–08 own that change)
