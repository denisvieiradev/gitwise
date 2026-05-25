---
status: completed
title: Add Dependabot auto-merge workflow
type: infra
complexity: low
dependencies:
  - task_12
  - task_13
  - task_14
---

# Task 15: Add Dependabot auto-merge workflow

## Overview
Land `.github/workflows/dependabot-auto-merge.yml` that auto-merges Dependabot PRs for npm minor and patch updates once the full test matrix, CodeQL, and OSV-Scanner have passed. Major bumps still require manual review per ADR-002 §Decision item 2. This is the throughput accelerator that makes the security-gate stack maintainable.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `.github/workflows/dependabot-auto-merge.yml` that activates only when the PR actor is `dependabot[bot]`.
- MUST gate auto-merge on the update being `version-update:semver-patch` OR `version-update:semver-minor` (using `dependabot/fetch-metadata` action).
- MUST require the full test matrix, CodeQL, and OSV-Scanner to pass before invoking `gh pr merge --auto --squash`.
- MUST NOT auto-merge any major version bump.
- MUST NOT auto-merge `github-actions` ecosystem PRs (those should be reviewed manually since they affect CI itself).
- MUST request the minimum required permissions: `contents: write`, `pull-requests: write`.
- MUST pin every Action use to a commit SHA per task_12 convention.
- MUST add a unit test verifying the workflow's actor + update-type guards are correct.
</requirements>

## Subtasks
- [x] 15.1 Author the workflow YAML with the actor and update-type gating.
- [x] 15.2 Use `dependabot/fetch-metadata` (SHA-pinned) to determine the update type and ecosystem.
- [x] 15.3 Add the `gh pr merge --auto --squash` invocation guarded by all required conditions.
- [x] 15.4 Exclude the `github-actions` ecosystem from auto-merge.
- [x] 15.5 Add a unit test asserting actor / update-type / ecosystem guards exist.

## Implementation Details
See ADR-002 §Decision item 2 and §Implementation Notes for the merge policy. The gating logic uses outputs from `dependabot/fetch-metadata` (e.g., `steps.metadata.outputs.update-type`, `steps.metadata.outputs.package-ecosystem`). Reference the most current `dependabot/fetch-metadata` and `peter-evans/enable-pull-request-automerge` (or `gh pr merge --auto`) docs at implementation time and pin to the resolved SHAs.

### Relevant Files
- `.github/workflows/dependabot-auto-merge.yml` — NEW.
- `packages/cli/__tests__/workflow-auto-merge.test.ts` (or root-level test) — NEW.

### Dependent Files
- `.github/dependabot.yml` (task_12) — defines the PR stream this workflow consumes.
- `.github/workflows/codeql.yml` (task_13) — required check.
- `.github/workflows/osv-scanner.yml` (task_14) — required check.
- `CONTRIBUTING.md` — task_17 documents what to expect from auto-merge.

### Related ADRs
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — Implements §Decision item 2 (auto-merge gating).

## Deliverables
- `.github/workflows/dependabot-auto-merge.yml` with actor + update-type + ecosystem gating.
- All Action references pinned to commit SHAs.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test verifying the workflow does NOT auto-merge majors or `github-actions` updates **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Workflow YAML parses; declares `on: pull_request` trigger.
  - [x] Job-level `if:` condition restricts to `github.actor == 'dependabot[bot]'`.
  - [x] Step-level `if:` condition restricts auto-merge to `semver-minor` OR `semver-patch`.
  - [x] Step-level `if:` condition excludes `package-ecosystem == 'github-actions'`.
  - [x] Permissions block declares only `contents: write` and `pull-requests: write`.
  - [x] Uses `dependabot/fetch-metadata@<sha>` (SHA-pinned).
- Integration tests:
  - [x] Simulated event payload for a `dependabot[bot]` npm patch PR: the conditions evaluate to "merge".
  - [x] Simulated event payload for a `dependabot[bot]` npm major PR: the conditions evaluate to "do not merge".
  - [x] Simulated event payload for a `dependabot[bot]` `github-actions` PR: the conditions evaluate to "do not merge".
  - [x] Simulated event payload for a non-Dependabot PR: the job is skipped.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- A real Dependabot npm patch PR (post-merge) auto-merges after all required checks pass
- A real Dependabot npm major PR remains open for manual review
- A `github-actions` ecosystem PR remains open for manual review
