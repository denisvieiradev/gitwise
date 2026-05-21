---
status: completed
title: Add release-strategy fields to RepoConfig
type: backend
complexity: low
dependencies: []
---

# Task 01: Add release-strategy fields to RepoConfig

## Overview
Extend the `RepoConfig` interface with two optional fields — `releaseStrategy` and `developBranch` — so downstream release code can read a repo-level strategy preference without parsing it from flags. Repos that don't set the fields keep behaving exactly as today (`github-flow` default, no `develop` branch involvement).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add an optional `releaseStrategy?: "github-flow" | "gitflow"` field to `RepoConfig`.
- MUST add an optional `developBranch?: string` field to `RepoConfig` (no default applied at the type level; consumers default to `"develop"`).
- MUST keep both fields purely additive — no removal, rename, or reorder of existing `RepoConfig` fields.
- MUST flow through `readRepoConfig` and `getMergedConfig` so callers receive the new fields when set in `.gitwise.json`.
- MUST extend `INVALID_REPO_CONFIG` validation (if any exists for known fields) to accept the new fields without warnings.
- The `ReleaseStrategyName` string union SHOULD be importable from a single canonical location once task_03 lands; until then, inline the union here and keep the names identical.
</requirements>

## Subtasks
- [x] 1.1 Extend the `RepoConfig` interface with the two optional fields.
- [x] 1.2 Verify `readRepoConfig` round-trips the new fields when present and omits them when absent.
- [x] 1.3 Verify `getMergedConfig` carries the fields through user → repo merge order without dropping them.
- [x] 1.4 Add unit-test coverage for both fields, including the unset / partial / both-set cases.
- [x] 1.5 Run the package typecheck and test suite to confirm no regression in existing config callers.

## Implementation Details
Edit `packages/core/src/config/types.ts` to add the two optional fields to `RepoConfig`. No new file needed. The fields are passive — only `prepareRelease`, `finishRelease`, and the strategy factory will read them later. Keep the inline string union (`"github-flow" | "gitflow"`) consistent with the `ReleaseStrategyName` defined in TechSpec → Implementation Design → Core Interfaces.

### Relevant Files
- `packages/core/src/config/types.ts` — Add the two optional fields to `RepoConfig`.
- `packages/core/src/config/repo.ts` — Confirm `readRepoConfig` does not blacklist unknown fields.
- `packages/core/src/config/merge.ts` — Confirm `getMergedConfig` deep-merges the new fields.
- `packages/core/src/config/user.ts` — Reference only; user-level config is unchanged.

### Dependent Files
- `packages/core/__tests__/unit/config/repo.test.ts` (or equivalent) — extend with cases for the new fields.
- `packages/core/__tests__/unit/config/merge.test.ts` (if present) — extend to cover the merge path.

### Related ADRs
- [ADR-002: Minimal release-scoped strategy abstraction](../adrs/adr-002.md) — Establishes that strategy selection is a repo-level config setting rather than a per-invocation flag.

## Deliverables
- Updated `RepoConfig` with `releaseStrategy` and `developBranch` optional fields.
- Unit tests for repo-config read and merge covering: unset, only `releaseStrategy`, only `developBranch`, both set.
- Unit tests with 80%+ coverage **(REQUIRED)**
- Integration tests for repo-config read **(REQUIRED — covered by extending the existing config read suite end-to-end against a temp `.gitwise.json` file)**

## Tests
- Unit tests:
  - [ ] `readRepoConfig` returns `releaseStrategy: "gitflow"` when the JSON file sets it.
  - [ ] `readRepoConfig` returns `developBranch: "trunk"` when the JSON file sets a non-default value.
  - [ ] `readRepoConfig` returns no extra fields when both are absent (existing behavior preserved).
  - [ ] `getMergedConfig` preserves repo-level `releaseStrategy` over an unset user value.
  - [ ] `getMergedConfig` does not invent a default `developBranch` — undefined stays undefined.
- Integration tests:
  - [ ] Round-trip: write a `.gitwise.json` with both fields, read it back through `getMergedConfig`, assert identity.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `RepoConfig` exports the new fields and existing callers compile unchanged.
- No existing config test fails after the change.
