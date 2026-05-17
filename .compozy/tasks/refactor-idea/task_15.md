---
status: completed
title: Add Phase 0 release tooling (scripts/release.mjs + tag-push CI publish)
type: infra
complexity: medium
dependencies:
  - task_01
  - task_12
---

# Task 15: Add Phase 0 release tooling (scripts/release.mjs + tag-push CI publish)

## Overview
Build the manual release script and GitHub Actions workflow that cut Phase 0 releases for the gitwise monorepo until `gw release` is dogfooded. The script propagates a locked version across every workspace package; the CI workflow publishes all workspaces on tag push.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- A new script `scripts/release.mjs` MUST be added that: accepts a bump argument (`patch`/`minor`/`major`) or an explicit version, computes the new version from the root `package.json`, propagates the new version to every `packages/*/package.json`, stages the modified files, commits with the message `chore(release): vX.Y.Z`, tags `vX.Y.Z`, and prints next-step instructions for pushing.
- The script MUST NOT push or publish on its own; pushing the tag MUST trigger CI.
- A new GitHub Actions workflow at `.github/workflows/release.yml` MUST trigger on tag pushes matching `v*`, install dependencies, build all workspaces, run all tests, and publish each workspace package with `npm publish --workspaces --access public`.
- The workflow MUST authenticate to npm via an `NPM_TOKEN` repository secret and to GitHub releases via `GITHUB_TOKEN`.
- The workflow MUST publish only if tests pass; a failing test step MUST abort the publish.
- The workflow MUST create a GitHub release using the tag and the contents of `CHANGELOG.md` (top section) as the release notes body.
- `CONTRIBUTING.md` MUST be updated with a "Releasing (Phase 0)" section that documents the script + push-tag flow and links to ADR-005.
- A documented fallback path MUST keep `scripts/release.mjs` available after Phase 1 (the script stays in the repo per ADR-005).
- Tests MUST cover the script's version-propagation logic against a `mkdtemp` workspaces fixture.
</requirements>

## Subtasks
- [x] 15.1 Implement `scripts/release.mjs` with bump-or-version argument parsing and workspace version propagation.
- [x] 15.2 Add the commit + tag steps; print explicit push instructions to stdout.
- [x] 15.3 Author `.github/workflows/release.yml` for tag-push publishing.
- [x] 15.4 Add the GitHub release creation step using the CHANGELOG top section.
- [x] 15.5 Update `CONTRIBUTING.md` with the Phase 0 release runbook.
- [x] 15.6 Add unit + integration tests for `scripts/release.mjs`.

## Implementation Details
Reference [ADR-005](adrs/adr-005.md) for the Phase 0/Phase 1 split and the rationale for keeping the script in the repo. Reference TechSpec "Development Sequencing" steps 15 and 17.

### Relevant Files
- `scripts/release.mjs` — new.
- `.github/workflows/release.yml` — new.
- `CONTRIBUTING.md` — update with Phase 0 release runbook.

### Dependent Files
- All `packages/*/package.json` files — receive the propagated version.
- `CHANGELOG.md` — read by the workflow for release body.
- `packages/cli/package.json` (from [[task_12]]) — its presence is required for the workflow's build step.

### Related ADRs
- [ADR-005: Locked-version monorepo releases via dogfooded `gw release`](adrs/adr-005.md) — drives this task.

## Deliverables
- `scripts/release.mjs` working end-to-end against a workspaces fixture.
- `.github/workflows/release.yml` validated by a workflow-lint run (e.g., `actionlint` if available; otherwise a manual checklist).
- `CONTRIBUTING.md` Phase 0 section.
- Unit + integration tests **(REQUIRED)**.
- Test coverage 80%+ on the script **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `release.mjs patch` reads root `package.json` version `0.1.2` and computes `0.1.3`.
  - [x] `release.mjs minor` computes `0.2.0` from `0.1.2`.
  - [x] `release.mjs major` computes `1.0.0` from `0.1.2`.
  - [x] `release.mjs 1.5.0` accepts an explicit version string.
  - [x] The script rejects an invalid bump argument with a clear error and exit code 1.
  - [x] The script propagates the new version to every `packages/*/package.json` in a `mkdtemp` fixture.
  - [x] The script does NOT modify files outside the workspaces and the root.
- Integration tests:
  - [x] End-to-end: in a `mkdtemp` workspaces fixture initialized as a git repo, `release.mjs patch` produces a commit with the expected message and a tag with the expected name.
  - [x] `.github/workflows/release.yml` parses as valid YAML and includes the four mandated steps (build, test, publish, gh release).
- Test coverage target: >=80% — achieved 94.44 / 80.76 / 92.85 / 95.87 (stmts/branch/funcs/lines) on `scripts/release.mjs`.
- All tests must pass — 279/279 passing across the full suite.

## Success Criteria
- All tests passing
- Test coverage >=80%
- A dry-run of `release.mjs` against the actual repo produces the expected version bumps and commit/tag.
- The release workflow YAML lints clean.
