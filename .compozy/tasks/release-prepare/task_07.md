---
status: completed
title: Implement abortRelease core function
type: backend
complexity: low
dependencies:
  - task_02
  - task_04
---

# Task 07: Implement abortRelease core function

## Overview
Add `abortRelease(opts)` to `packages/core/src/commands/release.ts`. It deletes the persisted plan file and, when a release branch was created, conditionally deletes that branch — refusing if the branch holds commits not present in `main` or `develop`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export `abortRelease(opts: AbortReleaseOptions): Promise<void>` with the shape defined in TechSpec → Implementation Design → Core Interfaces.
- MUST reject with `code === "NO_RELEASE_PLAN"` when no plan exists.
- MUST always delete the plan file when a plan is present.
- When `opts.deleteBranch === true` and `plan.releaseBranchCreated === true`, MUST attempt to delete the release branch with the safe (non-force) variant first.
- MUST refuse to force-delete a release branch that contains commits not yet merged to `main` (and to `develop` for gitflow). Surface a clear typed error so the CLI can prompt the user.
- MUST NOT remove or mutate `.gitwise/release-<version>.md` notes — the user may still want them.
- MUST emit `release.abort.start` and `release.abort.branch.deleted` debug events.
</requirements>

## Subtasks
- [x] 7.1 Define `AbortReleaseOptions` next to the existing release types.
- [x] 7.2 Load the plan; if absent, raise `NO_RELEASE_PLAN`.
- [x] 7.3 Delete the plan file via `deleteReleasePlan`.
- [x] 7.4 Conditionally delete the release branch via `deleteBranch`, with a merged-into-all-targets safety check.
- [x] 7.5 Cover happy paths and the unmerged-branch refusal path with unit tests.

## Implementation Details
Edit `packages/core/src/commands/release.ts`. The unmerged check can use `git branch --merged <target>` (or a small helper that piggybacks on `branchExists`). Reuse `deleteReleasePlan` from task_04 and `deleteBranch` from task_02.

### Relevant Files
- `packages/core/src/commands/release.ts` — Add `abortRelease`.
- `packages/core/src/commands/release-plan.ts` (task_04) — `loadReleasePlan`, `deleteReleasePlan`.
- `packages/core/src/infra/git.ts` (task_02) — `deleteBranch`, plus existing branch-listing helpers if needed.

### Dependent Files
- `packages/cli/src/commands/release.ts` (task_09) — Will call `abortRelease` from `gw release abort` and prompt for branch deletion.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Defines abort behavior.
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Specifies that abort deletes the plan and may delete the branch.

## Deliverables
- `abortRelease` export with `AbortReleaseOptions`.
- Refusal behavior when the release branch has unmerged commits.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for full lifecycle abort **(REQUIRED — exercised in the task_09 integration suite via `prepare` → `abort`)**

## Tests
- Unit tests:
  - [ ] No plan: rejects with `code === "NO_RELEASE_PLAN"`.
  - [ ] Plan present, `deleteBranch: false`: plan file removed, release branch (if any) untouched.
  - [ ] GitFlow plan, `deleteBranch: true`, branch fully merged into `main` and `develop`: branch is removed.
  - [ ] GitFlow plan, `deleteBranch: true`, branch has commits not in `main`: rejects with a typed error and the branch is NOT removed.
  - [ ] GitHub-flow plan, `deleteBranch: true`: plan removed, no branch action attempted (`releaseBranchCreated` is false).
  - [ ] Calling twice in a row succeeds-then-`NO_RELEASE_PLAN` (idempotent file delete, explicit rejection on the second call).
- Integration tests:
  - [ ] GitFlow `prepare` → `abort` round trip leaves the repo with no plan file and no release branch when fully merged.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `abortRelease` exported and usable from task_09.
- Notes file `.gitwise/release-<version>.md` is preserved across abort.
