---
status: completed
title: Wire `gw release prepare/finish/abort` CLI subcommands and integration tests
type: frontend
complexity: high
dependencies:
  - task_05
  - task_06
  - task_07
  - task_08
---

# Task 09: Wire `gw release prepare/finish/abort` CLI subcommands and integration tests

## Overview
Add three new Commander subcommands under `gw release` (`prepare`, `finish`, `abort`) in `packages/cli/src/commands/release.ts`, render every typed error with a clear recovery hint via `@clack/prompts`, and stand up an integration suite under `packages/core/__tests__/integration/` that exercises both strategies, the stale-plan recovery path, and the legacy one-shot. The root `gw release [version]` action continues to call the unified in-process helper from task_08.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST register `gw release prepare [version]`, `gw release finish`, and `gw release abort` as Commander subcommands on the existing `release` command (not as separate top-level commands).
- MUST keep `gw release [version]` as the default action with unchanged flags: `--bump`, `--apply`, `--no-gh-release`, `--no-workspace-propagation`.
- MUST add a new `--no-delete-branch` flag on `gw release finish` that maps to `opts.deleteReleaseBranch === false`.
- MUST render every typed error code listed in TechSpec (`STRATEGY_DEVELOP_MISSING`, `STRATEGY_RELEASE_BRANCH_EXISTS`, `STALE_PLAN_TAG_EXISTS`, `STALE_PLAN_BRANCH_MISMATCH`, `NO_RELEASE_PLAN`, `INVALID_PLAN_SCHEMA`, plus reused `WORKING_TREE_DIRTY`, `TAG_EXISTS`, `NO_COMMITS`, `INVALID_VERSION`, `NO_PACKAGE_JSON`) with a one-line message AND an actionable recovery hint (e.g., "run `gw release abort` to clear the plan").
- `gw release abort` MUST prompt the user before deleting the release branch when one exists; the prompt MUST default to "no" to be safe.
- MUST stand up the brand-new `packages/core/__tests__/integration/` directory and run under the existing Jest config (no new test runner).
- The integration suite MUST cover: gitflow lifecycle (prepare → finish), github-flow lifecycle (prepare → finish), edited-notes resume, stale-plan recovery via abort, legacy one-shot.
- Integration tests MUST use real temp git repos (already the convention) and stub `gh` via the existing test utilities; LLM is stubbed via `MockLLMProvider`.
- MUST resolve the strategy from `RepoConfig.releaseStrategy` via `getMergedConfig`, with `--strategy` NOT exposed as a CLI flag (per ADR-002 alternative 3).
- MUST print a one-line notice when `.gitignore` is modified by `ensureGitignored` (info-level log only — no prompt).
</requirements>

## Subtasks
- [x] 9.1 Register the three new subcommands and their flags via Commander.
- [x] 9.2 Implement subcommand handlers that call `prepareRelease`, `finishRelease`, `abortRelease`.
- [x] 9.3 Centralize typed-error rendering with recovery hints so all three handlers share the same error formatter.
- [x] 9.4 Add an abort confirmation prompt for release-branch deletion using `@clack/prompts`.
- [x] 9.5 Create `packages/core/__tests__/integration/` with five lifecycle scenarios.
- [x] 9.6 Wire integration tests into the existing Jest config (test pattern, no new runner).
- [x] 9.7 Smoke-test the new subcommands manually by running them against the gitwise repo's own scratch fixture.

## Implementation Details
Edit `packages/cli/src/commands/release.ts`. See TechSpec → System Architecture → CLI block for the subcommand layout, and TechSpec → Testing Approach → Integration Tests for the five required scenarios. Reuse the existing `detectWorkspaceRoot` and the existing `@clack/prompts` patterns from the file. The error formatter should be a single switch keyed by `error.code` returning `{ message, hint }`.

### Relevant Files
- `packages/cli/src/commands/release.ts` — Add subcommands, share error formatter, keep root action.
- `packages/core/src/commands/release.ts` (tasks 05–08) — Source of `prepareRelease`, `finishRelease`, `abortRelease`.
- `packages/core/src/config/merge.ts` — `getMergedConfig` for strategy resolution.
- `packages/core/__tests__/integration/` — New directory.
- `packages/core/src/testing/mock-llm-provider.ts` — `MockLLMProvider` for LLM stubbing.
- `packages/core/src/infra/github.ts` — Stubbed `gh` invocations in integration tests.
- `package.json` (root) — Confirm Jest pattern already picks up `__tests__/integration/**/*.test.ts`; extend if not.

### Dependent Files
- `packages/skills/scripts/release.ts` (task_10) — Must be updated to expose the new subcommands.
- `README.md` (task_11) — Documents the new CLI surface.

### Related ADRs
- [ADR-001: Split release into prepare and finish](../adrs/adr-001.md) — Defines the subcommand surface.
- [ADR-002: Minimal release-scoped strategy abstraction](../adrs/adr-002.md) — Strategy comes from config, not a flag.
- [ADR-003: Plan file lifecycle and integrity checks](../adrs/adr-003.md) — Validation errors that the CLI renders.

## Deliverables
- Three new Commander subcommands registered under `gw release`.
- Shared typed-error formatter with recovery hints for every code.
- New `--no-delete-branch` flag on `finish`.
- New `packages/core/__tests__/integration/` directory with five scenarios.
- Unit tests with 80%+ coverage **(REQUIRED — for the error formatter and subcommand wiring)**
- Integration tests for both strategies plus recovery paths **(REQUIRED)**

## Tests
- Unit tests:
  - [ ] Error formatter returns the expected `message` + `hint` for each of the ten typed codes.
  - [ ] `gw release prepare --bump minor` forwards `bump: "minor"` to `prepareRelease`.
  - [ ] `gw release finish --no-delete-branch` forwards `deleteReleaseBranch: false` to `finishRelease`.
  - [ ] `gw release abort` calls `abortRelease({ deleteBranch: true })` only after the user confirms; default-no aborts the prompt cleanly.
  - [ ] Strategy is resolved from `RepoConfig.releaseStrategy` and not from a CLI flag.
- Integration tests (under `packages/core/__tests__/integration/`):
  - [ ] **GitFlow lifecycle**: temp repo with `main` + `develop` + a feature → `prepareRelease` → assert artifacts, no tag → `finishRelease` → assert tag, both branches contain release commit, plan file gone, release branch gone.
  - [ ] **GitHub-flow lifecycle**: single-branch temp repo → `prepareRelease` (no branch created, no manifest mutation) → `finishRelease` (manifest bump now, tag created, plan deleted).
  - [ ] **Edited notes resume**: `prepare`, manually rewrite `.gitwise/release-1.2.0.md`, `finish`; assert gh release body matches the edited file and not `plan.notes`.
  - [ ] **Stale-plan recovery**: `prepare`, manually `git tag v1.2.0`, `finish` → assert `STALE_PLAN_TAG_EXISTS` and plan still on disk → `abort` cleans up.
  - [ ] **Legacy one-shot**: `gw release --apply` end-to-end against a single-branch repo; assert byte-identical artifacts vs snapshot from task_08.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `gw release --help` lists `prepare`, `finish`, and `abort` as subcommands and `gw release [version]` still runs as the default action.
- All ten typed error codes render a message AND a recovery hint.
- Integration suite runs under the existing `npm test` invocation.
