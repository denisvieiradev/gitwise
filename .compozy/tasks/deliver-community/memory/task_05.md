# Task Memory: task_05.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Shipped `Transaction` (LIFO compensate, `ROLLBACK_PARTIAL` surfacing) and `acquireRepoLock` (PID-liveness + 10-min staleness, atomic `wx` claim, cleanup-on-release) — no flow migrations (tasks 06–08 own that).

## Important Decisions
- `Transaction.rollback` returns `{ partial, failures }` AND emits a `code: "ROLLBACK_PARTIAL"` `logger.warn` once compensates finish. Tests can observe either; concrete callers can branch on the return value without grepping logger output. Techspec's `Promise<void>` was illustrative; richer return shape is non-breaking.
- `acquireRepoLock(repoPath, options?)` accepts an optional 2nd arg (`command`, `staleMs`, `isProcessAlive`, `now`). Strict required signature is `(repoPath) => Promise<release>` per task spec; injecting the clock/PID-liveness keeps unit tests deterministic and the production default unchanged.
- Atomic claim uses `fs.open(lockPath, "wx")` with one stale-reclaim retry (`attempt >= 1` re-throws `REPO_LOCKED`). This bounds the race window: if a peer wins the race after we unlink a stale lock, we surface REPO_LOCKED rather than loop.

## Learnings
- ts-jest needs `tsconfig.test.json` next to the workspace jest config. Running tests from repo root via `npm test` cannot resolve it because cwd ≠ workspace dir — this is a pre-existing baseline issue, not caused by task_05. Use `npm run -w packages/core test` for verification, as already noted in shared memory.
- `process.kill(pid, 0)` semantics: `ESRCH` → dead, `EPERM` → alive-but-other-uid. Treat invalid/non-positive pids as dead before signalling to avoid surprising behavior on negative/zero/NaN inputs.

## Files / Surfaces
- `packages/core/src/infra/transaction.ts` (new)
- `packages/core/src/infra/lockfile.ts` (new)
- `packages/core/src/index.ts` (added re-exports: `Transaction`, `Step`, `Logger`, `RollbackFailure`, `RollbackResult`, `acquireRepoLock`, `STALE_LOCK_MS`, `LockPayload`, `AcquireRepoLockOptions`)
- `packages/core/__tests__/unit/infra/transaction.test.ts`, `__tests__/unit/infra/lockfile.test.ts`, `__tests__/integration/transaction.test.ts`, `__tests__/integration/lockfile.test.ts` (new)

## Errors / Corrections
- First unit-test draft included a quirky `queueMicrotask`-driven race test that conflated two distinct branches. Rewrote it to deterministically force the second `EEXIST` path by re-creating the lockfile from inside `isProcessAlive`, which is the only hook called between `unlink` and the recursive `open wx`.

## Ready for Next Run
- task_06–08 can adopt the primitive via: `const tx = new Transaction(); try { ...await tx.run(step); } catch (err) { await tx.rollback(err, logger); throw err; }`. `acquireRepoLock` should wrap the entire side-effectful body; release in `finally` so REPO_LOCKED stays accurate even on apply-path throws.
- Coverage on new files: transaction.ts 94/100/100/94, lockfile.ts 89/86/100/94 — both ≥80%. Uncovered branches are POSIX EPERM in `defaultIsProcessAlive` (hard to cross-platform-test) and the non-Error fallback in `serializeError` — acceptable.
