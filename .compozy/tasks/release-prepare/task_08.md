---
status: completed
title: Refactor legacy one-shot release onto unified path
type: refactor
complexity: medium
dependencies:
  - task_05
  - task_06
---

# Task 08: Refactor legacy one-shot release onto unified path

## Overview
Rewire the existing one-shot `gw release` so it internally calls `prepareRelease` → confirm → `finishRelease` against the same in-memory plan (also written to and read from disk) instead of the old `release()` + `applyRelease()` pair. This collapses to a single code path while keeping the legacy UX byte-identical for existing users.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- The exported `release()` function MUST stay exported for backwards compatibility with the existing skill script and any external callers; mark it deprecated via inline comment, not via a runtime warning yet.
- The exported `applyRelease()` MUST stay exported but internally delegate to `finishRelease` against a `PersistedReleasePlan` built from its `ReleasePlan` argument.
- A new internal helper SHOULD wrap "prepare-then-finish-in-one-process" so the CLI root action becomes a thin caller of it.
- The legacy CLI root action `gw release [version]` MUST produce the same `package.json`, `CHANGELOG.md` entry, `.gitwise/release-<version>.md`, tag annotation, and `gh release` invocation as the pre-refactor implementation for the github-flow strategy on a single-branch repo.
- The unified path MUST write `.gitwise/release-plan.json` during the in-process flow and delete it on completion — verifying ADR-003 invariants apply on the legacy path too.
- A regression test MUST assert byte-identical artifacts against a snapshot captured from the existing test suite or computed inline.
</requirements>

## Subtasks
- [x] 8.1 Introduce an internal helper that runs `prepareRelease` → caller-provided confirm → `finishRelease`.
- [x] 8.2 Replace the existing one-shot internals while keeping `release()` and `applyRelease()` exported as adapters.
- [x] 8.3 Update the existing `release.test.ts` regression cases that asserted intermediate state from the old `applyRelease()` so they still pass via the unified path.
- [x] 8.4 Add a single regression test asserting legacy behavior on the github-flow happy path.
- [x] 8.5 Confirm `MockLLMProvider` is called exactly once per release in the unified path (no double LLM cost).

## Implementation Details
Edit `packages/core/src/commands/release.ts`. See TechSpec → Development Sequencing → step 8 for the framing. The internal helper can accept a `confirm` callback so the CLI can plug in `@clack/prompts` without coupling core to the CLI library. `applyRelease(plan, opts)` becomes a thin wrapper that calls `saveReleasePlan` then `finishRelease` to keep its old contract.

### Relevant Files
- `packages/core/src/commands/release.ts` — Refactor the one-shot path; keep public exports.
- `packages/core/src/commands/release-plan.ts` (task_04) — Used by the in-process flow to persist a transient plan.
- `packages/core/__tests__/unit/commands/release.test.ts` — Update / extend existing cases.

### Dependent Files
- `packages/skills/scripts/release.ts` — Currently calls `release()` then `applyRelease()`; this task must keep that contract working (task_10 will introduce subcommand-aware skill scripting).
- `packages/cli/src/commands/release.ts` — Will be rewired in task_09 to use the new internal helper for the root action.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Specifies that the default `gw release` preserves today's UX.
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Plan file write/delete invariants apply to the legacy path too.

## Deliverables
- One unified in-process release path used by both legacy `gw release` and the new explicit lifecycle.
- `release()` and `applyRelease()` retained as adapters with an inline deprecation comment.
- Regression test asserting legacy byte-identical artifacts.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for legacy one-shot end-to-end **(REQUIRED — covered alongside task_09 integration suite)**

## Tests
- Unit tests:
  - [ ] Legacy `release()` + `applyRelease()` invocation against a github-flow repo produces the same `package.json` version, `CHANGELOG.md` entry header, and `.gitwise/release-1.2.0.md` content as the pre-refactor snapshot.
  - [ ] The unified path invokes the LLM provider exactly once.
  - [ ] The plan file `.gitwise/release-plan.json` is created during the one-shot flow and deleted at the end.
  - [ ] If the confirm callback returns `false`, the flow aborts cleanly: plan file is deleted, no tag created, no manifest mutation.
  - [ ] If `finishRelease` throws after the confirm, the plan file remains so the user can recover with `gw release finish` or `gw release abort` (only when the failure mode warrants this — verify against the ADR-003 "delete plan first" rule).
- Integration tests:
  - [ ] Legacy one-shot end-to-end on github-flow: `gw release --apply` against a temp repo produces the same artifacts as the pre-refactor implementation.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Single code path drives both legacy one-shot and explicit two-phase releases.
- No double LLM call on the legacy path.
- All existing `release.test.ts` cases remain green after the refactor.
