# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Add `mergeNoFf`, `branchExists`, `headSha`, `deleteBranch` to `packages/core/src/infra/git.ts`, all wrapping the existing `run()`/`exec` helpers and `GIT_TIMEOUT_MS`.

## Important Decisions

- `branchExists` uses `git show-ref --verify --quiet refs/heads/<branch>` driven through `exec` directly (not `run`) so a non-zero exit can be caught and translated to `false` without losing the timeout/buffer settings.
- `deleteBranch` defaults `force` to `false` so callers can pass either `deleteBranch(cwd, "x")` or `deleteBranch(cwd, "x", true)`; the spec example signature is preserved.
- Did not add any new error codes — task explicitly says "surface plain Error objects so callers can attach typed `code` fields".

## Learnings

- `run()` already trims stdout, so `headSha` returns the bare 40-char SHA with no extra trim work.
- The package's `infra/index.ts` does `export * as git from "./git.js"` and the top-level `index.ts` re-exports `{ git }`, so any new function added to `git.ts` is automatically reachable as `git.mergeNoFf` etc. — no manual re-export needed.

## Files / Surfaces

- `packages/core/src/infra/git.ts` — appended four helpers below `pushWithTags`.
- `packages/core/__tests__/unit/infra/git.test.ts` — added describe blocks for each helper + integration round-trip.

## Errors / Corrections

- None.

## Ready for Next Run

- Task 03 (`strategies/release.ts`) can call `git.branchExists` for the `STRATEGY_DEVELOP_MISSING` check.
- Tasks 05–07 (`prepareRelease` / `finishRelease` / `abortRelease`) have the merge, head-sha, and branch-delete primitives they need.
