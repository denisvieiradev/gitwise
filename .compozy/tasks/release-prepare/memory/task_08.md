# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Refactor the legacy one-shot release path so `release() + applyRelease()` and any new "in-process two-phase" caller share a single code path. `release()` and `applyRelease()` stay exported as deprecated adapters; a new `runReleaseInProcess` helper drives `prepareRelease → confirm → finishRelease|abortRelease` against the same on-disk plan.

## Important Decisions

- `applyRelease` adapter now ALWAYS rejects when `v<newVersion>` already exists (TAG_EXISTS), regardless of `tagAndPush`. The previous "skip when tagAndPush:false" behavior was tied to the old code path; under delegation `finishRelease` treats any pre-existing tag as a stale-plan signal, so the legacy adapter mirrors that upfront with its own typed `TAG_EXISTS` error. Updated existing test accordingly (subtask 8.3).
- `FinishReleaseOptions` gained `workspacePropagation?: boolean` (github-flow only). Required so the `applyRelease` adapter can delegate without losing the workspace-bump-in-same-commit contract. Propagation runs after the root bump and before the commit; `packages/` is staged alongside `package.json` / `CHANGELOG.md`. Gitflow ignores it (manifest commit already happened during prepare).
- `runReleaseInProcess` takes a `confirm(plan): boolean | Promise<boolean>` callback so the helper stays UI-free and core does not import `@clack/prompts`. On `confirm === false` OR confirm throwing, it calls `abortRelease`; throws rethrow after abort.
- `release()` and `applyRelease()` got JSDoc `@deprecated` tags pointing at the new lifecycle. No runtime warning yet (task spec said inline comment only).

## Learnings

- Provoking a `STALE_PLAN_TAG_EXISTS` via runReleaseInProcess by pre-tagging the version FAILS earlier in prepare with `NO_COMMITS` (because pre-tagging makes `getLatestTag → vNN` and `git log vNN..HEAD` is empty). To exercise a between-confirm-and-finish failure that preserves the plan, dirty the working tree inside the `confirm` callback with a path NOT in the `.gitwise/` allow-list — finishRelease then trips `WORKING_TREE_DIRTY` during validation, before its plan-delete step.
- The plan file's existence between `prepareRelease` and `finishRelease` is observable from inside the `confirm` callback (prepare writes the plan LAST; finish deletes it FIRST). Used for the "plan file lifecycle" test.

## Files / Surfaces

- `packages/core/src/commands/release.ts` — added `runReleaseInProcess` + `RunReleaseInProcessOptions`, added `workspacePropagation` to `FinishReleaseOptions`, rewired `applyRelease` to write notes + persist plan + delegate to `finishRelease`, added `@deprecated` JSDoc on `release()` and `applyRelease()`. Removed the standalone `propagateVersionToWorkspaces` call from `applyRelease` (now invoked inside `finishRelease`'s github-flow branch).
- `packages/core/src/index.ts` — re-export `runReleaseInProcess` + `RunReleaseInProcessOptions`.
- `packages/core/__tests__/unit/commands/release.test.ts` — updated `"preflight: TAG_EXISTS check is skipped when tagAndPush is false"` to assert TAG_EXISTS thrown unconditionally; added two new describe blocks: `"legacy release() + applyRelease() unified path (task_08)"` (byte-identical artifacts on github-flow, tag annotation, gh release body) and `"runReleaseInProcess() (task_08)"` (single LLM call per release, plan-file lifecycle observability, confirm:false abort path, confirm-throws abort path, validation failure preserves plan).

## Errors / Corrections

- Initial draft of the "validation failure preserves plan" test used a pre-existing tag to trigger STALE_PLAN_TAG_EXISTS — that path is unreachable through prepareRelease because `release()` raises NO_COMMITS first. Fixed by dirtying the tree from within `confirm` instead (see Learnings).

## Ready for Next Run

- Public API now offers `runReleaseInProcess` as the unified entry point. Task_09 (CLI rewire) should replace the CLI root action's `release() → applyRelease()` pair with a single `runReleaseInProcess({ ..., confirm: claude-prompts-callback, finishOptions: { createGhRelease, workspacePropagation } })` call.
- Task_10 (skill script) can either keep using the deprecated `release()` + `applyRelease()` pair (still works) or migrate to `runReleaseInProcess` with `confirm: () => apply` to drive `--apply`.
- Auto-commit disabled per task instructions — diff left uncommitted under `packages/core/src/commands/release.ts`, `packages/core/src/index.ts`, `packages/core/__tests__/unit/commands/release.test.ts`. `npm test` (363/363) and `tsc --noEmit` (all 3 packages) are green.
