---
status: completed
title: Implement CLI exit-code dispatch, --json envelope, and deprecate --api-key
type: backend
complexity: medium
dependencies:
  - task_03
---

# Task 04: Implement CLI exit-code dispatch, --json envelope, and deprecate --api-key

## Overview
Update the CLI top-level handler to translate `GitwiseError` into the documented exit code, add a global `--json` flag that emits a machine-readable error envelope, and deprecate the `--api-key` flag (which leaks into `ps aux` and shell history). This is the user-visible surface of the ADR-003 contract.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST replace the existing top-level catch in `packages/cli/src/index.ts` so that errors of type `GitwiseError` exit with `err.exitCode`, while all other errors are wrapped via `wrapError` and exit with `EXIT_CODES.UNKNOWN`.
- MUST add a global `--json` flag in `packages/cli/src/program.ts` whose presence causes the CLI to emit the error envelope `{"error": {"code": "...", "message": "...", "exitCode": N, "details"?: {...}}}` to stdout on failure (still exiting with the proper code).
- MUST always emit the human message and a single-line hint pointing to `docs/exit-codes.md` to stderr when `--json` is NOT set.
- MUST print a deprecation warning to stderr when `--api-key` is used and document that the flag will be removed in `v0.next+1`.
- MUST NOT remove the `--api-key` flag in this task — only deprecate.
- MUST extend `gw --version` to honor `--json` and emit the same envelope shape for the version output.
- MUST surface the existing `--debug` flag's full stack trace only when set; without `--debug`, stacks are hidden but `code` is always shown.
</requirements>

## Subtasks
- [x] 4.1 Add the global `--json` flag in `program.ts` and thread its state into the error-handling layer.
- [x] 4.2 Refactor `index.ts:26–29` to dispatch on `instanceof GitwiseError` and `err.exitCode`; wrap unknowns with `wrapError`.
- [x] 4.3 Implement the JSON error envelope writer (stdout) and the human/hint writer (stderr).
- [x] 4.4 Add the deprecation warning for `--api-key` and update its help text.
- [x] 4.5 Update `gw --version` JSON output to mirror `--json` envelope shape.
- [x] 4.6 Update existing CLI tests that assumed exit code `1` for everything; add new tests for each branch.

## Implementation Details
See TechSpec §Implementation Design "Core Interfaces" for the envelope shape and ADR-003 §Decision for the CLI changes. Existing flag wiring is at `program.ts:26`; existing catch at `index.ts:26–29`. The hint footer should be a single line referencing `docs/exit-codes.md`. Make sure the JSON envelope is emitted as the only stdout content in `--json` mode — no progress chatter, no banner.

### Relevant Files
- `packages/cli/src/index.ts` — top-level error handler; current catch at lines 26–29.
- `packages/cli/src/program.ts` — flag definitions; existing `--api-key` at line 26.
- `packages/cli/__tests__/program.test.ts` — existing CLI tests.
- `packages/cli/__tests__/commands.test.ts` — existing command-flow tests.
- `packages/core/src/errors.ts` — read-only consumer (`GitwiseError`, `EXIT_CODES`, `wrapError`).

### Dependent Files
- `docs/src/content/docs/exit-codes.md` — task_02 publishes the doc the hint footer links to.
- `README.md` — task_18 documents the `--json` flag.
- `CONTRIBUTING.md` — task_17 documents the deprecation timeline for `--api-key`.

### Related ADRs
- [ADR-003: GitwiseError class with stable exit codes](../adrs/adr-003.md) — This task implements the CLI surface.

## Deliverables
- `--json` global flag wired through the CLI.
- Top-level handler dispatches on `GitwiseError.exitCode` and wraps unknowns as `UNKNOWN`.
- `--api-key` emits a deprecation warning.
- `gw --version --json` returns the documented envelope.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests covering at least one failure path in each EXIT_CODES category (NOTHING_STAGED, GIT_FAILED, API_KEY_MISSING) **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `GitwiseError` with `code: "NOTHING_STAGED"` causes the process to exit with code 10.
  - [x] A plain `new Error("boom")` thrown from core exits with code 1 and is logged with `code: "UNKNOWN"`.
  - [x] `--json` mode emits a parseable JSON object on stdout with `error.code`, `error.message`, `error.exitCode`.
  - [x] Without `--json`, stderr contains the human message AND a single-line hint mentioning `exit-codes.md`.
  - [x] `--debug` enables stack trace output; default mode does not.
  - [x] `--api-key` triggers a one-line deprecation warning to stderr.
  - [x] `gw --version --json` emits a documented envelope shape.
- Integration tests:
  - [x] End-to-end: `gw commit` with nothing staged exits 10 and prints the hint footer.
  - [x] End-to-end: missing `ANTHROPIC_API_KEY` exits 31.
  - [x] End-to-end: `gw --json commit` (nothing staged) emits a valid JSON envelope to stdout AND exits 10.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Every `EXIT_CODES` constant is reachable via at least one CLI test (covered jointly with task_03)
- `--json` mode emits envelope-only stdout (no banner pollution)
- `--api-key` deprecation visible in `--help` output
