---
status: completed
title: Implement core.release and applyRelease with workspace version propagation
type: backend
complexity: high
dependencies:
    - task_04
    - task_05
    - task_06
    - task_07
---

# Task 11: Implement core.release and applyRelease with workspace version propagation

## Overview
Port the release flow into `packages/core/src/commands/release.ts` as a non-interactive `release()` function returning a typed `ReleasePlan` plus an `applyRelease()` function that bumps versions, commits, tags, pushes, and creates a GitHub release. Adds workspace-aware version propagation for the gitwise monorepo's own dogfood release.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `packages/core/src/commands/release.ts` MUST export `async function release(opts?: ReleaseOptions): Promise<ReleasePlan>` and `async function applyRelease(plan, opts?: { tagAndPush?: boolean; createGhRelease?: boolean }): Promise<void>` matching the TechSpec "Core Interfaces".
- `release()` MUST inspect commits since the last tag and recommend a semver bump (`patch`/`minor`/`major`) using the existing devflow heuristic (Conventional Commits types map to bumps; presence of `BREAKING CHANGE` forces major).
- `release()` MUST honor `opts.bump` as an override, MUST compute the next version from the current `package.json` version, and MUST render the `release-changelog.md`, `release-notes.md`, and `release-version.md` templates.
- The returned `ReleasePlan` MUST include `suggestedBump`, `newVersion`, `changelog` (Keep a Changelog format), `notes` (client-facing), and `tokens`.
- `applyRelease(plan)` MUST update `package.json` version, prepend the changelog to `CHANGELOG.md` (Keep a Changelog format), write the release notes file, commit (`chore(release): vX.Y.Z`), tag (`vX.Y.Z`), push (if `tagAndPush !== false`), and create a GitHub release via `gh` (if `createGhRelease !== false` and `gh` is available).
- Workspace version propagation MUST update every `packages/*/package.json` to the same `newVersion` when `<repo>/.gitwise.json` has `workspacePropagation: true` (a new RepoConfig field this task introduces). Otherwise, only the root `package.json` is bumped.
- The function MUST honor `opts.language` for release notes language (defaulting to the merged config language; supported: `en`/`pt`/`es`/`fr`).
- The function MUST use the `fast` tier by default.
- All filesystem writes MUST be atomic (use the filesystem helper from [[task_04]]).
- Tests MUST cover the bump heuristic, workspace propagation on and off, the changelog prepend, and the `gh`-missing fallback (skips GitHub release creation).
</requirements>

## Subtasks
- [ ] 11.1 Create `packages/core/src/commands/release.ts` exporting `release()` and `applyRelease()`.
- [ ] 11.2 Port the semver-bump heuristic and the release templates rendering from `src/cli/commands/release.ts`.
- [ ] 11.3 Implement workspace version propagation gated by a new `workspacePropagation` field on `RepoConfig`.
- [ ] 11.4 Implement `applyRelease` with the commit/tag/push/`gh release create` sequence and the graceful fallbacks.
- [ ] 11.5 Add unit + integration tests; relocate `__tests__/unit/cli/release.test.ts`.

## Implementation Details
Reference TechSpec "Implementation Design → Core Interfaces" for `ReleaseOptions`, `ReleasePlan`, and `applyRelease`. Reference "Impact Analysis" for the workspace propagation requirement (it's flagged as `Medium risk` and `new behavior`). The Keep a Changelog format is preserved from devflow's existing templates.

### Relevant Files
- `src/cli/commands/release.ts` — port logic; drop interactive code.
- `packages/core/src/commands/release.ts` — new file.
- `packages/core/templates/release-changelog.md`, `release-notes.md`, `release-version.md` (from [[task_06]]) — prompt templates.
- `packages/core/src/infra/{git,github,filesystem}.ts` (from [[task_04]]) — provides commit/tag/push/release helpers.
- `packages/core/src/config/repo.ts` (from [[task_07]]) — add `workspacePropagation?: boolean` field.
- `__tests__/unit/cli/release.test.ts` — relocate and adapt.

### Dependent Files
- `packages/cli/src/commands/release.ts` (created in [[task_13]]) — calls `release()` then `applyRelease()` with flag overrides.
- `packages/skills/scripts/release.ts` (created in [[task_14]]) — calls `release()` and emits the plan as markdown.
- `scripts/release.mjs` (created in [[task_15]]) — temporary manual propagator until `gw release` dogfoods itself.

### Related ADRs
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — drives the non-interactive shape.
- [ADR-005: Locked-version monorepo releases via dogfooded `gw release`](adrs/adr-005.md) — drives the workspace propagation requirement.

## Deliverables
- `packages/core/src/commands/release.ts` implementing both functions.
- `RepoConfig.workspacePropagation` field added in [[task_07]]'s schema (extend if not present).
- Unit + integration tests **(REQUIRED)**.
- Test coverage 80%+ on the new module **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] Bump heuristic: only `fix:` commits → `patch`.
  - [ ] Bump heuristic: any `feat:` commit (no breaking) → `minor`.
  - [ ] Bump heuristic: any `BREAKING CHANGE` footer or `!` marker → `major`.
  - [ ] `opts.bump` overrides the heuristic.
  - [ ] `release()` returns `newVersion` computed from `package.json` current version + bump.
  - [ ] `release({ language: "pt" })` produces release notes in Portuguese using the corresponding template.
  - [ ] `release()` returns tokens summed across the changelog, notes, and version LLM calls.
  - [ ] `applyRelease` updates only root `package.json` when `workspacePropagation` is unset.
  - [ ] `applyRelease` updates every `packages/*/package.json` to `newVersion` when `workspacePropagation: true`.
  - [ ] `applyRelease` prepends the changelog block to `CHANGELOG.md` in Keep a Changelog format.
  - [ ] `applyRelease` skips `gh release create` and returns successfully when `gh` is unavailable.
  - [ ] `applyRelease({ tagAndPush: false })` does not invoke `git tag` or `git push`.
- Integration tests:
  - [ ] Against a `mkdtemp` workspaces repo with three `packages/*/package.json` files, `applyRelease()` with `workspacePropagation: true` propagates the version to all three.
  - [ ] Against the same repo with `gh` mocked as available, `applyRelease()` invokes `gh release create vX.Y.Z` with the notes body.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `release()` and `applyRelease()` are exported from `@denisvieiradev/gitwise-core`.
- Workspace propagation toggles cleanly between off and on.
