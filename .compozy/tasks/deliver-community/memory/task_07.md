# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Wrap every side-effectful step in `prepareRelease` (`packages/core/src/commands/release.ts`) inside a single `Transaction` under `acquireRepoLock`, plus the embedded gitflow workspace propagation. Plan write LAST. Compensate per ADR-004 §Decision item 1.

## Important Decisions
- Lock acquired BEFORE the dirty-tree preflight; the `.gitwise/` lockfile must be filtered from the dirty set (alongside `.gitignore`) or every fresh repo trips WORKING_TREE_DIRTY on `?? .gitwise/`.
- `commitReleaseStep` captures the pre-commit SHA and compensates via `git resetHard(preSha)`, so per-file compensates that run later don't have to wrestle with a working tree that was clean post-commit.
- `createReleaseBranchStep` compensate uses `git.checkoutForce` (new helper) before `branch -D`, so any compensate failure earlier in LIFO that left the working tree dirty still allows the branch to be discarded.
- `RELEASE_BRANCH_CONFLICT` replaces `STRATEGY_RELEASE_BRANCH_EXISTS` as the canonical code (exitCode 61). CLI `release-errors.ts` keeps the old code as a fallthrough alias so old plan-files and external callers keep their hint.

## Learnings
- `jest.spyOn(fsPromises, ...)` does NOT work on ESM `node:fs/promises` (it's a read-only Module namespace object). Filesystem-based failure injection — `chmod 0o444`, pre-create the target path as a directory (forces EISDIR or EACCES on writeFile), install a rejecting `pre-commit` hook — is the portable substitute. All 7 rollback integration tests use one of those three primitives.
- `rejects.toBeInstanceOf(Error)` cross-realm-fails under jest's experimental VM modules even when the rejection IS an Error. Use `rejects.toBeTruthy()` + `rejects.toMatchObject({ code })` instead. The cross-instance gotcha mirrors the GitwiseError note already in shared memory.
- Step-factory unit tests can drive a real git repo via `execFile` — keeps the apply/compensate contract honest without needing additional abstractions.

## Files / Surfaces
- `packages/core/src/commands/release.ts` — `prepareRelease` rewritten around a `Transaction`; six new exported step factories (`createReleaseBranchStep`, `writeFileStep`, `mutateGitignoreStep`, `writeChangelogStep`, `commitReleaseStep`, `savePlanStep`); `propagateVersionToWorkspaces` now delegates to the new `runWorkspaceVersionStepsInto` helper that runs inside a caller-supplied transaction (resolves the same-pid nested-lock risk recorded in shared memory).
- `packages/core/src/infra/git.ts` — new `checkoutForce` and `resetHard` helpers.
- `packages/cli/src/commands/release-errors.ts` — accepts both `RELEASE_BRANCH_CONFLICT` and the legacy alias.
- `packages/cli/__tests__/release-errors.test.ts` — adds the new code to the hint table.
- `packages/core/__tests__/unit/commands/release.test.ts` — updated `RELEASE_BRANCH_CONFLICT` expectation.
- `packages/core/__tests__/unit/commands/release-prepare-steps.test.ts` (new) — 14 unit tests covering each step factory's apply + compensate, LIFO ordering, and the plan-last invariant.
- `packages/core/__tests__/integration/release-prepare-rollback.test.ts` (new) — 7 integration fixtures: happy path + 4 failure boundaries (after branch / after notes / after gitignore / at plan write) + RELEASE_BRANCH_CONFLICT + github-flow plan failure. Every fixture asserts end-state byte-equality with pre-prepare via a snapshot helper.

## Errors / Corrections
- First pass of the integration test used `jest.spyOn(fsPromises, "writeFile")` and crashed at "Cannot assign to read only property 'writeFile'". Rewrote to use filesystem injection (chmod / pre-create-as-dir / pre-commit hook) so the tests work under ESM mocking constraints.
- `rejects.toBeInstanceOf(Error)` failed cross-realm in 2 tests; switched to `rejects.toBeTruthy()`.

## Ready for Next Run
- task_08 (commit-split Transaction migration) can reuse the step-factory pattern: every factory exports its prior-bytes capture and compensate so a similar `gw commit --split` rewrite is mechanical.
- `git.checkoutForce` / `git.resetHard` are now in place for task_08's named-stash compensate.
- `runWorkspaceVersionStepsInto` is the canonical way to embed workspace propagation inside any larger transactional flow without nesting locks.
