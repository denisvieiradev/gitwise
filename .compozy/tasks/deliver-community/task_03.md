---
status: completed
title: Migrate core throw sites to GitwiseError
type: refactor
complexity: medium
dependencies:
  - task_01
---

# Task 03: Migrate core throw sites to GitwiseError

## Overview
Replace every `Object.assign(new Error(...), { code })` and bare `throw new Error(...)` site in `@denisvieiradev/gitwise-core` with `new GitwiseError(...)` using the constants from task_01. This is a mechanical, codemod-style change that converts the implicit error contract into the typed contract that ADR-003 mandates and that task_04 and ADR-004 rollback dispatch depend on.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST migrate the existing `Object.assign(new Error(...), { code })` sites identified in the codebase (`infra/git.ts`, `commands/commit.ts`, `commands/release.ts`) to `new GitwiseError({ code, message, cause?, details? })`.
- MUST classify every `throw new Error(...)` in `packages/core/src/infra/git.ts`, `infra/github.ts`, `infra/env.ts`, and `providers/anthropic.ts` and assign the appropriate code (`GIT_FAILED`, `GH_FAILED`, `API_KEY_MISSING`, `CONFIG_INVALID`, `API_FAILED`, `API_RATE_LIMITED`, etc.).
- MUST preserve the original error message text and attach the original error as `cause` when wrapping a caught exception.
- MUST NOT change control flow — every previously thrown error is still thrown, just typed.
- MUST add unit tests asserting that representative error paths throw a `GitwiseError` with the expected `code`.
- SHOULD attach raw subprocess `stderr` (when available) as `details.stderr` for git/gh wrappers, since task_04 will surface this in `--json` mode.
- MUST NOT introduce any new public exports beyond what task_01 already added.
</requirements>

## Subtasks
- [x] 3.1 Migrate the 3 known sites in `infra/git.ts:325`, `commands/commit.ts:134`, and `commands/release.ts:288/293/297` (codes already present today).
- [x] 3.2 Audit and convert remaining bare `throw new Error(...)` sites in `infra/git.ts`, `infra/github.ts`, `infra/env.ts`, `providers/anthropic.ts` to typed `GitwiseError`s.
- [x] 3.3 Wrap caught underlying errors with `cause: err` so debug output preserves the chain.
- [x] 3.4 Update or extend unit tests that previously asserted on message substrings to also (or instead) assert on `err.code`.
- [x] 3.5 Grep the codebase for any remaining `Object.assign(new Error` to confirm zero sites remain.
- [x] 3.6 Reconcile any code constants used internally that are NOT yet in `EXIT_CODES` — either add them to `EXIT_CODES` and `docs/exit-codes.md` (coordinating with task_02 if it has merged) or rename to use an existing constant.

## Implementation Details
See TechSpec §Impact Analysis row "All `throw Object.assign(...)` sites in core (~40)" for the migration plan and §Testing Approach for the assertion pattern. Subprocess wrappers in `infra/git.ts` and `infra/github.ts` should throw `GIT_FAILED` / `GH_FAILED` with the caught error attached as `cause`. The Anthropic retry exhaustion path in `providers/anthropic.ts:48` ("Max retries exceeded") maps to `API_RATE_LIMITED`.

### Relevant Files
- `packages/core/src/infra/git.ts` — multiple throw sites; one known `Object.assign` at line 325.
- `packages/core/src/infra/github.ts` — throws on empty `gh` output at lines 50, 80, 108.
- `packages/core/src/infra/env.ts` — minimal handling at line 76; consumes API-key/config errors.
- `packages/core/src/providers/anthropic.ts` — retry-exhaustion throw at line 48.
- `packages/core/src/commands/commit.ts` — `Object.assign` at line 134 (`NOTHING_STAGED`).
- `packages/core/src/commands/release.ts` — `Object.assign` at lines 288, 293, 297.
- `packages/core/src/errors.ts` — read-only consumer (built in task_01).

### Dependent Files
- `packages/cli/src/index.ts` — task_04 dispatches on `err.exitCode`; this task makes that dispatch reliable.
- All `__tests__/*.test.ts` files in `packages/core/` that assert on error message strings — may need updates.

### Related ADRs
- [ADR-003: GitwiseError class with stable exit codes](../adrs/adr-003.md) — This task implements §Impact Analysis row "All throw sites in core".

## Deliverables
- All identified `Object.assign(new Error...)` sites in `packages/core/src/` migrated to `GitwiseError`.
- All bare `throw new Error(...)` sites in the four infra/provider files audited and migrated where appropriate.
- Updated unit tests asserting `code` instead of/in addition to message text.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests covering the migrated paths in `git.ts`, `github.ts`, and `anthropic.ts` **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `commit.ts` no-staged-changes path throws `GitwiseError` with `code: "NOTHING_STAGED"`.
  - [ ] `release.ts` invalid-current-version path throws `code: "RELEASE_PLAN_STALE"` (or correct mapped code).
  - [ ] `release.ts` no-`package.json` path throws a documented `code` (mapped from `NO_PACKAGE_JSON` to an `EXIT_CODES` constant).
  - [ ] `infra/git.ts` non-zero exit path throws `code: "GIT_FAILED"` with the underlying error as `cause`.
  - [ ] `infra/github.ts` empty-output path throws `code: "GH_FAILED"`.
  - [ ] `providers/anthropic.ts` retry-exhaustion path throws `code: "API_RATE_LIMITED"`.
- Integration tests:
  - [ ] End-to-end `commit` invocation with no staged changes surfaces `code: "NOTHING_STAGED"` to the caller.
  - [ ] End-to-end `release prepare` against an invalid plan surfaces the documented stale-plan code.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `grep -rn "Object.assign(new Error" packages/core/src/` returns zero matches
- Every documented code in `EXIT_CODES` is reachable from at least one core test
