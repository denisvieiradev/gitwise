---
status: completed
title: Establish GitwiseError class and EXIT_CODES table
type: backend
complexity: medium
dependencies: []
---

# Task 01: Establish GitwiseError class and EXIT_CODES table

## Overview
Introduce the foundational `GitwiseError` class and the frozen `EXIT_CODES` table in `@denisvieiradev/gitwise-core`. This task establishes the public error contract that every other ADR-003/ADR-004 task depends on; it ships the new module and its unit tests but leaves existing throw sites untouched (task_03 migrates them).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export `GitwiseError` (extends `Error`) from a new module `packages/core/src/errors.ts`.
- MUST expose readonly `code`, `exitCode`, `cause`, and `details` properties as defined in the TechSpec "Core Interfaces" section.
- MUST export a frozen `EXIT_CODES` mapping covering every code listed in ADR-003 (OK, UNKNOWN, NOTHING_STAGED, INVALID_INTENT, GIT_FAILED, GH_FAILED, REPO_STATE_INVALID, API_FAILED, API_KEY_MISSING, API_RATE_LIMITED, USER_ABORT, CONFIG_INVALID, RELEASE_PLAN_STALE, RELEASE_BRANCH_CONFLICT, SENSITIVE_FILE_BLOCKED) plus the rollback/concurrency codes from the TechSpec (REPO_LOCKED=80, ROLLBACK_PARTIAL=81).
- MUST export a `wrapError(err: unknown): GitwiseError` helper that returns the input unchanged when it is already a `GitwiseError`, otherwise wraps it under `code: "UNKNOWN"`.
- MUST set `name = "GitwiseError"` so framework consumers can identify it via `err.name`.
- MUST be re-exported from the package barrel so consumers can `import { GitwiseError, EXIT_CODES } from "@denisvieiradev/gitwise-core"`.
- MUST NOT modify any existing throw sites in this task — migration is task_03.
</requirements>

## Subtasks
- [x] 1.1 Create `packages/core/src/errors.ts` exporting `GitwiseError`, `EXIT_CODES`, and `wrapError`.
- [x] 1.2 Re-export the new symbols from the core package's public entry (`packages/core/src/index.ts`).
- [x] 1.3 Add unit tests for construction, default exit-code lookup, override behavior, `wrapError` passthrough, and JSON serialization shape.
- [x] 1.4 Verify `EXIT_CODES` is `Object.freeze`d and that direct mutation throws in strict mode.
- [x] 1.5 Confirm category number ranges (10s/20s/30s/etc.) match ADR-003 so future codes slot in cleanly.

## Implementation Details
See TechSpec §Implementation Design "Core Interfaces" for the exact `GitwiseError` shape and `EXIT_CODES` numbering. See ADR-003 §Decision for the rationale and §Implementation Notes for `wrapError` semantics. No existing files are modified beyond the core package barrel.

### Relevant Files
- `packages/core/src/errors.ts` — NEW. Class, frozen table, and helper.
- `packages/core/src/index.ts` — re-export the new symbols.
- `packages/core/__tests__/errors.test.ts` — NEW. Unit tests for the contract.

### Dependent Files
- `packages/core/src/infra/git.ts`, `infra/github.ts`, `infra/env.ts`, `providers/anthropic.ts`, `commands/commit.ts`, `commands/release.ts` — will consume `GitwiseError` in task_03; not touched here.
- `packages/cli/src/index.ts` — will dispatch on `err.exitCode` in task_04; not touched here.

### Related ADRs
- [ADR-003: GitwiseError class with stable exit codes](../adrs/adr-003.md) — This task implements the class and table.

## Deliverables
- `packages/core/src/errors.ts` exporting `GitwiseError`, `EXIT_CODES`, `wrapError`.
- Core package barrel updated to re-export the new symbols.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for `wrapError` passthrough on existing core error shapes **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Constructor sets `code`, `message`, `name = "GitwiseError"`.
  - [x] `exitCode` defaults to the value in `EXIT_CODES[code]` when omitted.
  - [x] `exitCode` defaults to `1` for unknown codes.
  - [x] Explicit `exitCode` argument overrides the table lookup.
  - [x] `cause` and `details` are preserved on the instance.
  - [x] `EXIT_CODES.OK === 0`, `UNKNOWN === 1`, `REPO_LOCKED === 80`, `ROLLBACK_PARTIAL === 81`.
  - [x] `EXIT_CODES` is frozen — mutation throws in strict mode.
  - [x] `wrapError(new GitwiseError(...))` returns the same instance.
  - [x] `wrapError(new Error("boom"))` returns a `GitwiseError` with `code: "UNKNOWN"`.
  - [x] `wrapError("string thrown")` does not crash and yields `code: "UNKNOWN"`.
- Integration tests:
  - [x] `JSON.stringify` on a `GitwiseError` includes `code`, `exitCode`, `details` for `--json` mode (precondition for task_04).
- Test coverage target: >=80% — actual: 100% (statements/branches/functions/lines) on `src/errors.ts`.
- All tests must pass — 18/18 errors-suite tests pass; full core suite 354/354.

## Success Criteria
- All tests passing
- Test coverage >=80%
- `GitwiseError` and `EXIT_CODES` importable from `@denisvieiradev/gitwise-core`
- No existing throw sites changed (verified by grep — task_03 owns that change)
