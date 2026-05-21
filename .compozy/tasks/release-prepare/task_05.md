---
status: completed
title: Implement prepareRelease core function
type: backend
complexity: high
dependencies:
  - task_02
  - task_03
  - task_04
---

# Task 05: Implement prepareRelease core function

## Overview
Add a new `prepareRelease(opts)` async function to `packages/core/src/commands/release.ts` that runs the LLM planner, conditionally creates a release branch (GitFlow), writes manifest + changelog + notes artifacts when a release branch was created, persists the `PersistedReleasePlan` last, and ensures the plan file is gitignored. This is the first half of the explicit two-phase lifecycle.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export `prepareRelease(opts: PrepareReleaseOptions): Promise<PersistedReleasePlan>` with the option shape defined in TechSpec → Implementation Design → Core Interfaces.
- MUST resolve the active strategy from `opts.strategy` first, falling back to `RepoConfig.releaseStrategy`, defaulting to `"github-flow"`.
- MUST fail fast with `code === "STRATEGY_DEVELOP_MISSING"` when the gitflow strategy is selected and the configured develop branch does not exist locally.
- MUST fail fast with `code === "STRATEGY_RELEASE_BRANCH_EXISTS"` when the gitflow strategy is selected and `release/<newVersion>` already exists.
- MUST reuse the existing `release()` planner (LLM calls + `bumpVersion` + heuristics) — no second LLM round trip.
- For GitFlow: MUST create `release/<newVersion>` from the develop branch, write `package.json` bump and `CHANGELOG.md` entry on that release branch, write `.gitwise/release-<newVersion>.md` notes, and set `releaseBranchCreated: true` on the plan.
- For GitHub-flow: MUST NOT create a branch and MUST NOT mutate `package.json` or `CHANGELOG.md` (those happen in `finish`). MUST still write `.gitwise/release-<newVersion>.md` notes for user editing. Set `releaseBranchCreated: false`.
- MUST write the plan file LAST after all other mutations succeed (ADR-003 invariant).
- MUST call `ensureGitignored(cwd, ".gitwise/release-plan.json")` before saving the plan.
- MUST capture `baseCommit = await headSha(cwd)` and `targetBranch` (the branch `finish` must run on — release branch for gitflow, `main` for github-flow) in the plan.
- MUST emit `release.prepare.start`, `release.prepare.branch.created`, and `release.prepare.plan.saved` debug events via the existing `debug()` logger.
</requirements>

## Subtasks
- [x] 5.1 Define `PrepareReleaseOptions` and add the function signature next to the existing `release()` function.
- [x] 5.2 Resolve strategy from opts → config → default.
- [x] 5.3 Validate strategy preconditions (`requiresDevelop`, `branchExists`) and raise typed errors.
- [x] 5.4 Drive the LLM plan via the existing `release()` function and build the `PersistedReleasePlan` from its output.
- [x] 5.5 For GitFlow, create the release branch and write manifest + changelog + notes on it.
- [x] 5.6 For GitHub-flow, write only the notes file.
- [x] 5.7 `ensureGitignored` then `saveReleasePlan` last.
- [x] 5.8 Cover happy paths and every typed error path with unit tests.

## Implementation Details
Edit `packages/core/src/commands/release.ts`. See TechSpec → Implementation Design → Core Interfaces for the exact option / return types, TechSpec → Data flow for the step ordering on each strategy, and ADR-003 → Lifecycle invariants for the "plan written last" rule. Reuse `infra/git.ts` helpers from task_02 (`branchExists`, `headSha`, `createBranch`, `checkout`, `mergeNoFf` is NOT used here — only in `finish`).

### Relevant Files
- `packages/core/src/commands/release.ts` — Add `prepareRelease` and `PrepareReleaseOptions`; reuse `release()` for the LLM phase.
- `packages/core/src/commands/release-plan.ts` (task_04) — `saveReleasePlan`, `ensureGitignored`.
- `packages/core/src/strategies/release.ts` (task_03) — `createReleaseStrategy`, `ReleaseStrategy`.
- `packages/core/src/infra/git.ts` (task_02) — `branchExists`, `headSha`, plus existing `createBranch`, `checkout`, `getBranch`.
- `packages/core/src/infra/filesystem.ts` — `writeJSON`, `ensureDir` for the manifest / notes writes.
- `packages/core/src/infra/logger.ts` — `debug()` for structured events.

### Dependent Files
- `packages/core/src/commands/release.ts` `applyRelease()` — Task_06 will refactor it; this task should not change its public signature.
- `packages/cli/src/commands/release.ts` (task_09) — Will call `prepareRelease` from the new `gw release prepare` subcommand.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Defines what `prepare` does and does not do.
- [ADR-002: Minimal release-scoped strategy abstraction](../adrs/adr-002.md) — Strategy resolution and gitflow branch creation rule.
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Plan write order and gitignore rule.

## Deliverables
- New `prepareRelease` export with `PrepareReleaseOptions` and a typed return.
- Strategy-driven branch creation and artifact writes.
- Plan file persisted last with `.gitignore` coverage.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for the prepare flow on both strategies **(REQUIRED — covered by extending `release.test.ts` with strategy-specific cases)**

## Tests
- Unit tests:
  - [x] GitHub-flow happy path: `prepareRelease({version:"1.2.0"})` returns a plan with `releaseBranchCreated:false`, `package.json` is **unchanged**, `.gitwise/release-plan.json` exists, `.gitwise/release-1.2.0.md` exists.
  - [x] GitFlow happy path: `prepareRelease({version:"1.2.0", strategy:"gitflow"})` creates `release/1.2.0`, bumps `package.json` on that branch, writes `CHANGELOG.md` on that branch, plan has `releaseBranchCreated:true` and `targetBranch:"release/1.2.0"`.
  - [x] GitFlow + missing develop: rejects with `code === "STRATEGY_DEVELOP_MISSING"` and no plan file is written.
  - [x] GitFlow + existing release branch: rejects with `code === "STRATEGY_RELEASE_BRANCH_EXISTS"` and no plan file is written.
  - [x] Dirty working tree: rejects with `code === "WORKING_TREE_DIRTY"` (existing check) and no plan file is written.
  - [x] No commits since last tag: rejects with `code === "NO_COMMITS"` and no plan file is written.
  - [x] On any LLM-stage failure, no plan file is created (atomic-ish invariant).
  - [x] `ensureGitignored` is invoked before `saveReleasePlan`.
  - [x] Plan field `baseCommit` matches `git rev-parse HEAD` at the moment prepare started.
  - [x] Plan field `tokens` matches the `release()` planner output tokens.
- Integration tests:
  - [x] GitFlow lifecycle prepare: init repo with `main` + `develop`, run `prepareRelease`, assert all artifacts and absence of any tag.
  - [x] GitHub-flow lifecycle prepare: init single-branch repo, run `prepareRelease`, assert no branch was created and `package.json` is untouched.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `prepareRelease` exported from `packages/core` and consumable by task_06 / task_08 / task_09.
- All five new typed error codes from TechSpec are raised by the appropriate failure paths.
