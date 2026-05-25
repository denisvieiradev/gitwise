# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Wrap workspace `package.json` / sibling `plugin.json` version bumps inside a `Transaction` so a mid-loop write failure restores prior bytes of every previously-written manifest.
- Acquire `.gitwise/.lock` around the propagation flow and release it on both success and failure.

## Important Decisions
- Step factory exported as `writeWorkspaceVersionStep(manifestPath, newVersion): Step<Buffer>` — generic enough to cover both `package.json` and sibling `plugin.json`. Apply captures **bytes via `readFile(path)` (no encoding → Buffer)**, then re-serializes through `writeJSON` for the new version; compensate writes the captured Buffer back unchanged.
- Iteration order made deterministic by `.sort()`-ing `workspaceDirs` inside `propagateVersionToWorkspaces` before the Transaction loop. ADR-004 §Decision requires "ordering is deterministic"; without sort, `readdir` order leaks into the rollback path AND into the returned manifest list (which drives `git add` order in the release commit).
- On apply failure we wrap non-`GitwiseError` causes in `GitwiseError({ code: "WORKSPACE_VERSION_WRITE_FAILED", exitCode: EXIT_CODES.GIT_FAILED, cause })` before invoking `tx.rollback(reason, txLogger)` and re-throwing. The `ROLLBACK_PARTIAL` warning is emitted by `Transaction.rollback` itself — we do not emit a second one.
- Added `warn()` to `src/infra/logger.ts` (one-line addition that completes the logger contract Transaction's `Logger` interface needs). Inlined `txLogger` in `release.ts` routes Transaction warnings through it.

## Learnings
- `chmod 0o444` on a workspace manifest reliably reproduces an apply-time write failure in unit/integration tests without breaking the read (Node fs needs write permission, not read permission, to fail at write time).
- `Transaction.run` only pushes to `applied` AFTER `step.apply()` resolves — if apply throws, that step is never rolled back, which is the correct behavior: nothing was committed.
- `process.kill(pid, 0)` on the current process pid returns true, so the lockfile's stale-detection correctly treats the second acquire in the same process as a live lock holder → REPO_LOCKED.

## Files / Surfaces
- `packages/core/src/commands/release.ts` — replaced `propagateVersionToWorkspaces` body with Transaction+lock; added `writeWorkspaceVersionStep` export and a local `txLogger`.
- `packages/core/src/infra/logger.ts` — added `warn()`.
- `packages/core/src/index.ts` — re-exports `propagateVersionToWorkspaces` and `writeWorkspaceVersionStep`.
- `packages/core/__tests__/unit/commands/release.test.ts` — added describe blocks for the step factory and for the rollback/lock behavior of `propagateVersionToWorkspaces`.
- `packages/core/__tests__/integration/release-version-propagation.test.ts` — new file covering the 3-workspace failure boundary, lock release on both paths, and the REPO_LOCKED race.

## Errors / Corrections
- None blocking. One pre-existing flaky test (`unit/infra/lockfile.test.ts` → "fails fast with REPO_LOCKED when a fresh lock re-appears between reclaim and re-acquire") fails ~1-in-3 in full-suite runs but passes in isolation and three consecutive clean re-runs. Microtask-race based, present on baseline before this task started. Out of scope.
- `npm run lint` is broken on this repo due to missing `jiti` for ESLint's TS-config loader. Pre-existing tooling gap, unrelated.

## Ready for Next Run
- task_07 (release prepare → Transaction) will further wrap `propagateVersionToWorkspaces` inside a larger prepare Transaction. The current shape returns `string[]` of modified relative paths and owns its own lock + transaction; task_07 may want to refactor to either compose the inner Transaction into the outer one (e.g. accept an external `Transaction` instance and skip the inner lock), or keep the current self-contained shape and let the outer flow nest its own lock acquire — note that nested acquires from the same process pid will currently REPO_LOCKED themselves. **Action for task_07**: decide whether to (a) split out a `propagateVersionStepsInto(tx, ...)` variant that doesn't acquire the lock, or (b) make `acquireRepoLock` reentrant within the same pid.
