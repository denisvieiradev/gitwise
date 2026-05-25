# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Wrap the commit-split loop in `applyCommitPlan` (commit.ts) with a `Transaction` backed by a named git stash + per-commit `git reset --soft` compensates.

## Important Decisions
- Used `git stash push --include-untracked` (not plain stash) to capture truly untracked files too.
- Did NOT use `--index` on `stashApplyNamed` or `stashPopNamed`: `--index` is incompatible with `--include-untracked` stashes for newly-staged (never-committed) files.
- Stash compensate must run `git reset --hard HEAD` + `git clean -fd` BEFORE the pop. The `-fd` clean is required because `stashApplyNamed` restores files to the working tree (not the index), making them untracked from git's perspective. On partial rollback, those untracked files remain after `reset --hard` and block the pop.
- Happy path explicitly calls `stashDropNamed` after the loop completes; the compensate path pops (which also drops) on failure.
- `resetStaged` (after stash apply) is a no-op when --index is not used; kept for clarity since future git versions might differ.

## Learnings
- `git stash apply` (without --index) restores staged new files to working tree as MODIFIED/UNTRACKED, not re-staged.
- `git reset --hard HEAD` only clears TRACKED/STAGED files; untracked files remain in the working tree. Must pair with `git clean -fd` before a stash pop in compensate paths.
- `git stash push --include-untracked` saves staged + unstaged + untracked. On pop (without --index), restores all to working tree.

## Files / Surfaces
- `packages/core/src/infra/git.ts` — added: `resetSoft`, `stashPushNamed`, `stashList`, `stashApplyNamed`, `stashPopNamed`, `stashDropNamed`, `cleanForced`, `findStashRef` (private)
- `packages/core/src/commands/commit.ts` — added: `takeNamedStashStep`, `applyOneCommitStep`, `CommitStepResult`; refactored: `applyCommitPlan` split path now uses Transaction + acquireRepoLock
- `packages/core/src/index.ts` — exported: `takeNamedStashStep`, `applyOneCommitStep`, `CommitStepResult`, `stashList`
- `packages/core/__tests__/unit/commands/commit.test.ts` — extended with step-factory unit tests
- `packages/core/__tests__/integration/commit-split-rollback.test.ts` — new file: 7 integration tests covering happy path, i=0/middle/last failures, stash naming, INVALID_INTENT

## Errors / Corrections
- First attempt used `--index` in stash pop → failed silently for newly-staged files.
- Second attempt: removed `--index` → fixed pop, but stash pop still failed for untracked files (d, e) left in working tree by stash apply.
- Third attempt: added `git clean -fd` before pop → all rollback tests pass.

## Ready for Next Run
task_08 complete. task_17 (docs/recovery.md) must reference the named stash convention `gitwise/split-<ISO8601-timestamp>` and instruct users to run `git stash pop` using the predictable name when they see ROLLBACK_PARTIAL from commit-split.
