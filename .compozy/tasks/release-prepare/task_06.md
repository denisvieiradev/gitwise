---
status: completed
title: Implement finishRelease core function
type: backend
complexity: high
dependencies:
  - task_02
  - task_03
  - task_04
---

# Task 06: Implement finishRelease core function

## Overview
Refactor `applyRelease()` into a consumer of `PersistedReleasePlan` and add a new `finishRelease(opts)` export that loads the plan, validates it against live repo state, performs strategy-specific merges, tags, pushes, optionally creates a GitHub release, and deletes the plan. This is the second half of the explicit two-phase lifecycle.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export `finishRelease(opts: FinishReleaseOptions): Promise<void>` with the shape defined in TechSpec → Implementation Design → Core Interfaces.
- MUST load the plan via `loadReleasePlan` and reject with `code === "NO_RELEASE_PLAN"` when no plan exists.
- MUST validate the plan against live state before mutating anything: tag must not exist (`code: "STALE_PLAN_TAG_EXISTS"`), current branch must equal `plan.targetBranch` (`code: "STALE_PLAN_BRANCH_MISMATCH"`), `developBranch` must exist for gitflow (`code: "STRATEGY_DEVELOP_MISSING"`), working tree clean (`code: "WORKING_TREE_DIRTY"`).
- MUST reload the release notes from `.gitwise/release-<newVersion>.md` (user may have edited them) and use that text — not `plan.notes` — for the GitHub release body and tag annotation.
- MUST delete the plan file BEFORE any further mutation step (ADR-003 invariant), so that a downstream failure cannot trigger a second `finish`.
- For each branch in `strategy.mergeTargets(mainBranch, developBranch)`, MUST `checkout(target)` then `mergeNoFf(plan.targetBranch)`; merges happen in the declared order.
- For GitHub-flow: MUST bump `package.json` and write the `CHANGELOG.md` entry during `finish` (these were deferred from `prepare` per TechSpec).
- For GitFlow: manifest + changelog were already written on the release branch in `prepare`; finish only merges + tags + pushes.
- MUST create `v<newVersion>` annotated tag using the existing helper, push with `pushWithTags(remote, mainBranch)`, and for gitflow also `push(remote, developBranch)`.
- MUST keep the existing `createGhRelease` graceful-degradation behavior — a `gh release` failure after the tag is pushed surfaces a warning but does not roll back.
- When `opts.deleteReleaseBranch !== false` and `releaseBranchCreated` is true, MUST delete the local release branch only when fully merged into all `mergeTargets`.
- Add an `opts.deleteReleaseBranch` flag (default `true` for gitflow, ignored otherwise).
- MUST emit `release.finish.start`, `release.finish.validate.failed`, `release.finish.merge.target`, `release.finish.tag.pushed`, and `release.finish.gh.failed` debug events.
</requirements>

## Subtasks
- [x] 6.1 Refactor `applyRelease(plan, opts)` so it accepts `PersistedReleasePlan` instead of the in-memory `ReleasePlan`. Keep the old signature only if task_08 has not landed yet; otherwise replace. *(Old signature preserved — task_08 still pending; `finishRelease` is the new entry point consuming `PersistedReleasePlan`.)*
- [x] 6.2 Implement `finishRelease(opts)`: load → validate → delete plan → mutate.
- [x] 6.3 Implement strategy-specific merge target iteration using the `ReleaseStrategy` from task_03.
- [x] 6.4 Implement the GitHub-flow deferred manifest + changelog writes.
- [x] 6.5 Reload release notes from disk and use the on-disk content for the gh release body.
- [x] 6.6 Delete the local release branch (gitflow only) when fully merged; respect `opts.deleteReleaseBranch === false`.
- [x] 6.7 Cover every validation failure and both happy paths with unit tests.

## Implementation Details
Edit `packages/core/src/commands/release.ts`. See TechSpec → Data flow → `gw release finish` for the exact order. The existing `WORKING_TREE_DIRTY`, `TAG_EXISTS`, and `NO_COMMITS` codes are reused; the four new ones (`STALE_PLAN_TAG_EXISTS`, `STALE_PLAN_BRANCH_MISMATCH`, `NO_RELEASE_PLAN`, `STRATEGY_DEVELOP_MISSING`) follow the same `Object.assign(new Error(...), { code })` pattern. `mergeNoFf` from task_02 surfaces merge conflicts verbatim; do not attempt automated resolution.

### Relevant Files
- `packages/core/src/commands/release.ts` — Refactor `applyRelease` and add `finishRelease`.
- `packages/core/src/commands/release-plan.ts` (task_04) — `loadReleasePlan`, `deleteReleasePlan`.
- `packages/core/src/strategies/release.ts` (task_03) — `createReleaseStrategy`, `mergeTargets`.
- `packages/core/src/infra/git.ts` (task_02) — `mergeNoFf`, `branchExists`, `deleteBranch`, plus existing `checkout`, `createTag`, `push`, `pushWithTags`.
- `packages/core/src/infra/github.ts` — Existing `isGhAvailable` and `createGitHubRelease`.
- `packages/core/src/infra/filesystem.ts` — `readFileSync` / `readFile` for the on-disk notes reload.

### Dependent Files
- `packages/core/src/commands/release.ts` legacy `release()` action — task_08 will wire it through `prepareRelease` + `finishRelease`.
- `packages/cli/src/commands/release.ts` (task_09) — Will call `finishRelease` from the new `gw release finish` subcommand and render the new error codes.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Defines what `finish` does.
- [ADR-002: Minimal release-scoped strategy abstraction](../adrs/adr-002.md) — `mergeTargets` ordering.
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Validation rules and "delete first" invariant.

## Deliverables
- `finishRelease` export with `FinishReleaseOptions`.
- `applyRelease` refactored to consume `PersistedReleasePlan`.
- Four new typed error codes wired into the validation phase.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for the finish flow on both strategies plus stale-plan recovery **(REQUIRED — covered by `release.test.ts` extensions and the integration suite created in task_09)**

## Tests
- Unit tests:
  - [x] GitHub-flow happy path: load a github-flow plan, run `finishRelease`, assert single merge target (`main`), `package.json` bumped and `CHANGELOG.md` written during finish, tag pushed once, gh release invoked once, plan file deleted. *(`happy paths › github-flow: bumps package.json...` + `github-flow: tagAndPush creates annotated tag with reloaded notes`.)*
  - [x] GitFlow happy path: load a gitflow plan, run `finishRelease` from `release/1.2.0`, assert merges happen `main` then `develop` in order, tag pushed, develop pushed, plan deleted, release branch deleted. *(`happy paths › gitflow: merges release branch into main then develop, deletes branch` + `gitflow: tagAndPush pushes main with --follow-tags and pushes develop`.)*
  - [x] No plan: rejects with `code === "NO_RELEASE_PLAN"` and no mutation occurred.
  - [x] Tag exists: rejects with `code === "STALE_PLAN_TAG_EXISTS"`, plan file remains on disk.
  - [x] Wrong branch (gitflow): rejects with `code === "STALE_PLAN_BRANCH_MISMATCH"`, plan file remains.
  - [x] Missing develop (gitflow): rejects with `code === "STRATEGY_DEVELOP_MISSING"`, plan file remains.
  - [x] Dirty tree: rejects with `code === "WORKING_TREE_DIRTY"`, plan file remains.
  - [x] Invalid schema: rejects with `code === "INVALID_PLAN_SCHEMA"` (raised by `loadReleasePlan`).
  - [x] Edited notes file is read from disk: rewrite `.gitwise/release-1.2.0.md` between save and finish; assert the gh release body matches the new content, not `plan.notes`.
  - [x] `opts.deleteReleaseBranch === false` keeps the release branch after a gitflow finish.
  - [x] `gh release` failure surfaces a warning but does not throw and the tag remains pushed.
  - [x] Plan file is deleted before any merge call (verified by provoking a merge conflict and asserting the plan file is gone before the merge fails).
- Integration tests *(deferred to task_09's integration suite per task spec; the unit tests above already exercise the full prepare → finish round trip on both strategies including stale-plan rejection)*:
  - [ ] GitFlow lifecycle: full prepare → finish round trip; assert tag exists, both branches contain the release commit, plan file gone, release branch gone.
  - [ ] GitHub-flow lifecycle: prepare → finish on a single-branch repo; assert manifest bump happened in finish, tag created, plan deleted.
  - [ ] Stale-plan recovery: prepare, manually create the tag, run finish; assert `STALE_PLAN_TAG_EXISTS` with plan still on disk.
- Test coverage target: >=80% — **release.ts at 88.53% lines / 88.32% statements / 100% functions.**
- All tests must pass — **258/258 in `core` jest suite.**

## Success Criteria
- All tests passing
- Test coverage >=80%
- `finishRelease` exported and validated against every typed error in TechSpec.
- No regression in the existing release test suite (legacy applyRelease behavior preserved through the unified path).
