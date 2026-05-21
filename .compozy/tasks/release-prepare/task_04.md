---
status: completed
title: Implement release plan persistence module
type: backend
complexity: medium
dependencies:
  - task_03
---

# Task 04: Implement release plan persistence module

## Overview
Create `packages/core/src/commands/release-plan.ts` containing the `PersistedReleasePlan` type and the pure filesystem helpers `saveReleasePlan`, `loadReleasePlan`, `deleteReleasePlan`, and `ensureGitignored`. This module is the on-disk source of truth between `prepare` and `finish`, written last in prepare and read first in finish (ADR-003).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export `PersistedReleasePlan` with `schema: 1` and the exact fields listed in TechSpec → Implementation Design → Data Models.
- MUST export `saveReleasePlan(cwd, plan)`, `loadReleasePlan(cwd)`, `deleteReleasePlan(cwd)`, and `ensureGitignored(cwd, entry)`.
- MUST write the plan to `<cwd>/.gitwise/release-plan.json` using the existing `writeJSON` helper from `infra/filesystem.ts`.
- `loadReleasePlan` MUST return `null` when the file is absent, throw a typed error with `code: "INVALID_PLAN_SCHEMA"` when `schema !== 1`, and throw a typed error on malformed JSON.
- `deleteReleasePlan` MUST be idempotent — calling it without a plan present is not an error.
- `ensureGitignored(cwd, ".gitwise/release-plan.json")` MUST detect coverage by an exact-match line, a wildcard like `.gitwise/`, or `.gitwise/*` before appending. When appending, append a newline-terminated entry and print a one-line notice via the existing `info()` logger.
- MUST NOT depend on git or LLM modules — pure filesystem only.
- MUST re-export the type and functions through `packages/core/src/index.ts`.
</requirements>

## Subtasks
- [x] 4.1 Define `PersistedReleasePlan` and import `ReleaseStrategyName` from `strategies/release.ts`.
- [x] 4.2 Implement `saveReleasePlan` using `ensureDir` + `writeJSON`.
- [x] 4.3 Implement `loadReleasePlan` with absent-file → null and schema-mismatch → typed error.
- [x] 4.4 Implement idempotent `deleteReleasePlan`.
- [x] 4.5 Implement `ensureGitignored` with the four coverage cases listed in the requirements.
- [x] 4.6 Add unit tests for save → load round-trip, schema rejection, idempotent delete, and the four `ensureGitignored` cases.
- [x] 4.7 Re-export through `packages/core/src/index.ts`.

## Implementation Details
New file: `packages/core/src/commands/release-plan.ts`. See TechSpec → Implementation Design → Data Models for `PersistedReleasePlan` shape and ADR-003 → File contents for the per-field semantics. Use `writeJSON` / `readJSON` / `fileExists` / `ensureDir` from `packages/core/src/infra/filesystem.ts` rather than `fs.promises` directly. Typed errors follow the existing pattern `Object.assign(new Error(...), { code })` used throughout `commands/release.ts`.

### Relevant Files
- `packages/core/src/commands/release-plan.ts` — New module under the existing `commands/` folder.
- `packages/core/src/infra/filesystem.ts` — Source of `readJSON`, `writeJSON`, `fileExists`, `ensureDir`.
- `packages/core/src/strategies/release.ts` (task_03) — Imports `ReleaseStrategyName` for the type.
- `packages/core/src/infra/logger.ts` — `info()` for the one-line `.gitignore` notice.
- `packages/core/src/index.ts` — Re-export the new public surface.

### Dependent Files
- `packages/core/src/commands/release.ts` (task_05, task_06, task_07, task_08) — Consumes save/load/delete during the lifecycle.
- `packages/cli/src/commands/release.ts` (task_09) — Renders errors raised by `loadReleasePlan` and friends.

### Related ADRs
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Defines the file contents, lifecycle invariants, and validation rules.
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Establishes the plan file as the handoff artifact.

## Deliverables
- New module `packages/core/src/commands/release-plan.ts` with the type and four helpers.
- Public re-exports added to `packages/core/src/index.ts`.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for `ensureGitignored` against a real temp `.gitignore` file **(REQUIRED)**

## Tests
- Unit tests:
  - [x] `saveReleasePlan` then `loadReleasePlan` round-trips an object with identical field values.
  - [x] `loadReleasePlan` returns `null` when `.gitwise/release-plan.json` does not exist.
  - [x] `loadReleasePlan` throws with `code === "INVALID_PLAN_SCHEMA"` when the file's `schema` is `2`.
  - [x] `loadReleasePlan` throws a typed error when the file is not valid JSON.
  - [x] `deleteReleasePlan` removes the file when present.
  - [x] `deleteReleasePlan` does not throw when the file is absent.
  - [x] `ensureGitignored` appends `.gitwise/release-plan.json` when no `.gitignore` exists.
  - [x] `ensureGitignored` appends the entry when `.gitignore` exists but lacks coverage.
  - [x] `ensureGitignored` is a no-op when the exact entry already exists.
  - [x] `ensureGitignored` is a no-op when a wildcard `.gitwise/` already covers the entry.
- Integration tests:
  - [x] Run `ensureGitignored` against a temp repo where `.gitignore` has unrelated content; assert the file gains the entry while preserving prior content and trailing newline behavior.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Module exports are usable from downstream lifecycle tasks.
- No git or LLM dependency in the module imports.
