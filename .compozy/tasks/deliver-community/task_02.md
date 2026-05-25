---
status: completed
title: Author docs/exit-codes.md with parity test
type: docs
complexity: low
dependencies:
  - task_01
---

# Task 02: Author docs/exit-codes.md with parity test

## Overview
Publish the authoritative exit-code contract at `docs/exit-codes.md` and add a parity test that fails CI whenever `EXIT_CODES` and the documentation drift apart. This locks the contract that downstream shell-script and CI consumers will rely on per ADR-003.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `docs/exit-codes.md` containing a markdown table with columns `Code`, `Constant`, `Category`, `Meaning`, and `When raised`.
- MUST document every constant exported from `EXIT_CODES` (task_01) including `OK`, `UNKNOWN`, `REPO_LOCKED`, `ROLLBACK_PARTIAL`.
- MUST add a unit test that parses the markdown table at test time and asserts bidirectional equality with `EXIT_CODES`: every documented code exists in the table, and every table row is documented (no drift in either direction).
- MUST place the doc under the existing `docs/src/content/docs/` Astro site so it is published with the docs build.
- MUST include a one-paragraph preamble explaining that codes are a public contract, that renumbering is breaking, and that integrations should branch on `code` rather than message text.
- SHOULD include a short "branching from shell" example showing `case $? in 10) ... ;; esac`.
</requirements>

## Subtasks
- [x] 2.1 Author the exit-codes table in `docs/src/content/docs/exit-codes.md` using ADR-003 §Decision as the source.
- [x] 2.2 Add the contract preamble and a shell example.
- [x] 2.3 Implement the parity test that reads the markdown, extracts code/constant pairs, and diffs both directions against `EXIT_CODES`.
- [x] 2.4 Wire the doc into the docs site navigation if a nav config exists.
- [x] 2.5 Verify the test fails when a code is added to the table but not to `EXIT_CODES` (and vice versa) via a deliberate-failure local check before commit.

## Implementation Details
See ADR-003 §Decision for the canonical code list and §Implementation Notes for the parity-test approach. The docs site is Astro-based (existing pages live under `docs/src/content/docs/`). The parity test should live next to the core tests so it runs as part of the regular suite.

### Relevant Files
- `docs/src/content/docs/exit-codes.md` — NEW. Public contract.
- `packages/core/__tests__/exit-codes-parity.test.ts` — NEW. Bidirectional drift detector.
- `packages/core/src/errors.ts` — read-only consumer (`EXIT_CODES`).

### Dependent Files
- `README.md` — task_18 will link out to this doc.
- `packages/cli/src/index.ts` — task_04 emits the doc URL as a one-line hint footer on error.

### Related ADRs
- [ADR-003: GitwiseError class with stable exit codes](../adrs/adr-003.md) — This task publishes the documented half of that contract.

## Deliverables
- `docs/exit-codes.md` (under the Astro `docs/src/content/docs/` tree) documenting every code.
- Parity test that asserts no drift between code and docs.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test exercising the parity assertion against the live docs file **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Parity: every constant in `EXIT_CODES` appears in the markdown table with the same numeric code.
  - [x] Parity: every row in the markdown table maps to a constant in `EXIT_CODES`.
  - [x] Parity: a fixture markdown with a missing row fails the assertion with a clear diff.
  - [x] Parity: a fixture markdown with an extra row fails the assertion with a clear diff.
- Integration tests:
  - [x] Reads `docs/src/content/docs/exit-codes.md` from disk and runs the full parity check on the shipped file.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `docs/src/content/docs/exit-codes.md` published and rendered by the docs site
- Parity test catches drift in both directions (verified with fixtures)
