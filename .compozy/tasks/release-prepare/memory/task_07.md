# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement `abortRelease(opts: AbortReleaseOptions): Promise<void>` in `packages/core/src/commands/release.ts`. Delete the plan file; optionally delete the release branch (gitflow); refuse if release branch holds commits not in all strategy merge targets; preserve `.gitwise/release-<v>.md`.

## Important Decisions

- Safety check runs BEFORE `deleteReleasePlan` so an `RELEASE_BRANCH_UNMERGED` refusal leaves both plan file and branch intact for recovery/retry. Plan-always-delete rule is interpreted as "on success path", consistent with finishRelease's pre-mutation validation pattern.
- New error code `RELEASE_BRANCH_UNMERGED` (typed via the existing `Object.assign(new Error, { code })` convention) — not in the TechSpec's enumerated list but required by the task's "clear typed error" mandate. Future task_09 CLI will key off this code for the recovery prompt.
- Used `git merge-base --is-ancestor <branch> <target>` (wrapped as `git.isBranchMerged`) for the merge check instead of `git branch --merged` because it gives a single exit-code answer with no parsing.
- Always checkout `mainBranch` before `git branch -d` (mirrors finishRelease step 8) so the deletion isn't blocked by HEAD pointing at the release branch — the common state right after `prepare`.

## Learnings

- `mergeTargets` includes `plan.targetBranch` itself for github-flow (the user's branch IS the only target). Loop must skip self-target — same pattern finishRelease uses at step 7.

## Files / Surfaces

- `packages/core/src/commands/release.ts` — added `AbortReleaseOptions` interface + `abortRelease` function.
- `packages/core/src/infra/git.ts` — added `isBranchMerged(cwd, branch, target)` helper.
- `packages/core/src/index.ts` — re-exports `abortRelease` value + `AbortReleaseOptions` type.
- `packages/core/__tests__/unit/commands/release.test.ts` — new `describe("abortRelease()")` block with 7 cases.

## Errors / Corrections

None.

## Ready for Next Run

- task_09 (CLI wiring) should map `RELEASE_BRANCH_UNMERGED` to the "branch has unmerged commits, force-delete?" prompt path. The error message already names the unmerged target branch for the prompt body.
- `--no-delete-branch` (TechSpec line ~181) is a finishRelease flag, not abortRelease — abort's default is `deleteBranch: false`, so the CLI's `gw release abort` should prompt the user explicitly.
