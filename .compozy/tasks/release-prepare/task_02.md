---
status: completed
title: Add merge/branch git infra helpers
type: infra
complexity: low
dependencies: []
---

# Task 02: Add merge/branch git infra helpers

## Overview
Add four small helpers to `infra/git.ts` — `mergeNoFf`, `branchExists`, `headSha`, and `deleteBranch` — that the strategy layer and the new release lifecycle functions need. All four wrap the existing `run()` helper, follow the existing timeout/buffer conventions, and surface plain `Error` objects so callers can attach typed `code` fields.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `mergeNoFf(cwd: string, source: string): Promise<void>` running `git merge --no-ff <source>`.
- MUST add `branchExists(cwd: string, branch: string): Promise<boolean>` resolving safely to `false` when the branch is missing rather than throwing.
- MUST add `headSha(cwd: string): Promise<string>` returning the full commit SHA at HEAD.
- MUST add `deleteBranch(cwd: string, branch: string, force?: boolean): Promise<void>` mapping `force=true` to `git branch -D` and otherwise `git branch -d`.
- MUST reuse the existing `run()` helper signature and the `GIT_TIMEOUT_MS` constant — no new timeout / buffer plumbing.
- MUST NOT swallow stderr; bubble up the raw `git` error message so callers can display merge-conflict guidance.
- MUST be re-exported through the package-level barrel if `infra/git.ts` is already barrel-exported.
</requirements>

## Subtasks
- [x] 2.1 Implement `mergeNoFf` using `run(["merge", "--no-ff", source], cwd)`.
- [x] 2.2 Implement `branchExists` using a safe ref check that does not throw on absence.
- [x] 2.3 Implement `headSha` using `run(["rev-parse", "HEAD"], cwd)` and trim the result.
- [x] 2.4 Implement `deleteBranch(cwd, branch, force?)` covering both safe and force variants.
- [x] 2.5 Cover each helper with unit tests against a temp git repo.

## Implementation Details
Edit `packages/core/src/infra/git.ts`. Match the surrounding helper style (`async function name(...)` then `export`); keep the `run()` wrapper signature consistent. See TechSpec → Integration Points for the rationale on letting merge conflicts surface verbatim. `branchExists` should prefer a non-throwing primitive such as `git show-ref --verify --quiet refs/heads/<branch>`; treat a non-zero exit purely as "branch absent."

### Relevant Files
- `packages/core/src/infra/git.ts` — Add the four helpers next to the existing `createBranch` / `checkout` / `getBranch` block.
- `packages/core/__tests__/unit/infra/git.test.ts` (or equivalent) — Extend with the new cases.

### Dependent Files
- `packages/core/src/strategies/release.ts` (task_03) — Will call `branchExists` to validate `developBranch`.
- `packages/core/src/commands/release.ts` (task_05, task_06, task_07) — Will call `mergeNoFf`, `headSha`, `deleteBranch`.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Identifies the merge-and-tag move that `finishRelease` performs.
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Documents the `baseCommit` validation that depends on `headSha`.

## Deliverables
- Four exported helpers in `infra/git.ts`.
- Unit tests for each helper against an isolated temp git repo.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for merge + delete round-trip **(REQUIRED — exercised via a real temp repo, not mocked)**

## Tests
- Unit tests:
  - [x] `mergeNoFf` produces a merge commit (not a fast-forward) when both branches have diverged commits.
  - [x] `mergeNoFf` rejects with a non-empty error message containing "conflict" when the merge cannot auto-resolve.
  - [x] `branchExists` returns `true` for an existing local branch.
  - [x] `branchExists` returns `false` for a missing branch without throwing.
  - [x] `headSha` returns a 40-character SHA and matches `git rev-parse HEAD` output.
  - [x] `deleteBranch(cwd, "x")` succeeds when `x` is fully merged.
  - [x] `deleteBranch(cwd, "x")` rejects when `x` is unmerged.
  - [x] `deleteBranch(cwd, "x", true)` succeeds for an unmerged branch.
- Integration tests:
  - [x] Round-trip: create branch → make commit → checkout main → `mergeNoFf` → assert non-FF merge commit exists and points to both parents.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- All four helpers exported and consumed-ready for downstream tasks.
- No existing `infra/git.ts` test fails after the change.
