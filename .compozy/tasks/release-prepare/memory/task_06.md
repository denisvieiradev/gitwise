# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Add `finishRelease(opts: FinishReleaseOptions): Promise<void>` to `packages/core/src/commands/release.ts` that loads a `PersistedReleasePlan`, validates it against live state with four new typed error codes, deletes the plan FIRST (ADR-003), then applies strategy-specific merges/tag/push/gh-release/branch-delete. Cover with unit tests in `release.test.ts`.

## Important Decisions

- Kept the existing `applyRelease(plan: ReleasePlan, opts)` signature unchanged — task_06 subtask 6.1 says "Keep the old signature only if task_08 has not landed yet" and task_08 is still pending. Refactor of `applyRelease` onto the unified path is task_08's responsibility.
- `FinishReleaseOptions` stays narrow per TechSpec → Core Interfaces: `{ cwd, tagAndPush?, createGhRelease?, deleteReleaseBranch? }`. No `mainBranch`, `developBranch`, or `workspacePropagation` overrides; they're resolved internally or deferred to task_08.
- `mainBranch` resolution: gitflow auto-detects via `git.detectBaseBranch`; github-flow reuses `plan.targetBranch` (the branch the user was on at prepare).
- `developBranch` resolution on finish: opts → RepoConfig → `"develop"` is NOT used here — finish reads RepoConfig only (no opts override) since TechSpec interface forbids it. Acceptable because gitflow users who customized develop also set it in `.gitwise.json`.
- Self-merge skip: when a `mergeTargets` entry equals `plan.targetBranch` (always the case for github-flow), we don't `checkout` or `mergeNoFf` it — nothing to merge. Without this skip github-flow would try to merge `main` into `main`.
- Working-tree dirty filter: prepare deliberately leaves `.gitwise/release-plan.json`, `.gitwise/release-<v>.md`, and a freshly-created `.gitignore` uncommitted (notes are user-editable; plan is gitignored). The finish dirty check filters these expected paths so legitimate user-dirty files still trip `WORKING_TREE_DIRTY` but the prepare artifacts don't.
- Validation order: tag → branch → dirty → develop. Cheap checks first; tag check runs unconditionally even when `tagAndPush:false` so a stale plan is rejected regardless of the push opt.
- Notes reload from `.gitwise/release-<newVersion>.md` happens BEFORE plan deletion so a missing/unreadable notes file leaves the plan intact for `abort`.
- Tag annotation = the reloaded notes (not `plan.notes`). Tag is created on `mainBranch` after all merges so its parent is the merge commit on main for gitflow.
- Release branch deletion uses safe `-d` (no `force`). `git.deleteBranch` calls `branch -d`; if the branch isn't fully merged it errors — but after merges into all targets it will be, so this is correct. Wrapped in try/catch + `release.finish.branch.delete.failed` debug so a non-fatal failure doesn't roll back the release.

## Learnings

- `git status --porcelain` shows the parent directory entry (e.g. `?? .gitwise/`) when the entire directory is untracked, NOT individual filenames inside. The filter has to match both the directory form and the individual file forms.
- Jest in this repo only works via `npm test` (which sets `--experimental-vm-modules`); running `npx jest` directly hits the `loader.ts` `import.meta` compile error on six test suites (pre-existing — same failure on `main`). Treat `npm test` as the canonical test command.
- `jest.unstable_mockModule` requires importing `jest` from `@jest/globals` — it is not on the auto-injected global.
- `git push <origin> <branch> --follow-tags` to a local bare repo works fine for end-to-end push tests; `addOrigin` helper in the test file sets that up.
- The repo-level `npm run lint` aliases to `tsc --noEmit` for `packages/core` (no eslint at the package level). The root-level eslint can't run due to a missing `jiti` dep — a pre-existing environment issue unrelated to this task.

## Files / Surfaces

- `packages/core/src/commands/release.ts`
  - Added `FinishReleaseOptions` interface.
  - Added `finishRelease()` (~125 lines): load → validate (4 typed errors + dirty filter) → reload notes → delete plan → github-flow manifest writes → strategy merge loop → checkout main → tag + push → optional gh release → safe branch delete.
  - Imported `deleteReleasePlan`, `loadReleasePlan` from `./release-plan.js`.
  - Emits `release.finish.start`, `release.finish.validate.failed`, `release.finish.merge.target`, `release.finish.tag.pushed`, `release.finish.gh.failed`, `release.finish.branch.delete.failed` debug events.
- `packages/core/src/index.ts` — added `finishRelease` and `FinishReleaseOptions` to the barrel.
- `packages/core/__tests__/unit/commands/release.test.ts`
  - Added `jest` import (needed for `jest.unstable_mockModule`).
  - Added `saveReleasePlan` import for the round-trip test.
  - Added `describe("finishRelease()")` block with 16 cases covering happy paths (both strategies), all five validation failures, edited-notes reload, gh failure graceful, deleteReleaseBranch:false, and the ADR-003 "delete plan before merge" invariant via a provoked merge conflict.

`applyRelease` and its tests are untouched.

## Errors / Corrections

- First test run: 10 of my finishRelease tests failed because the dirty-tree check tripped on the expected `.gitwise/` + `.gitignore` files prepare leaves uncommitted. Fix: introduced the `expectedDirtyPaths` filter described above.

## Ready for Next Run

- task_07 (`abortRelease`) consumes `loadReleasePlan` + `deleteReleasePlan`. The plan-deletion-first invariant tested here applies symmetrically to abort.
- task_08 (legacy one-shot refactor) should reuse the same `expectedDirtyPaths` filter when the in-process flow drives `finishRelease` against a transient plan — otherwise the one-shot path will trip its own dirty check.
- task_09 (CLI) needs to render four new error codes: `NO_RELEASE_PLAN`, `STALE_PLAN_TAG_EXISTS`, `STALE_PLAN_BRANCH_MISMATCH`, `STRATEGY_DEVELOP_MISSING`. The first three should suggest `gw release abort` or `gw release prepare` as recovery; the last should point to creating the configured develop branch.
- The finish-time strict mainBranch handling means a gitflow repo with neither `main` nor `master` will throw `NO_BASE_BRANCH` from `git.detectBaseBranch`. Surface this in the CLI error renderer.
