---
status: completed
title: Configure Dependabot and pin GitHub Actions to commit SHAs
type: infra
complexity: low
dependencies: []
---

# Task 12: Configure Dependabot and pin GitHub Actions to commit SHAs

## Overview
Land `.github/dependabot.yml` to enable automated dependency updates for `npm` and `github-actions` ecosystems, and migrate every third-party Action use in existing workflows to a pinned commit SHA (with the version tag in a trailing comment). This is the prerequisite for the OIDC release-pipeline hardening in task_16 and for the auto-merge workflow in task_15.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `.github/dependabot.yml` configuring two ecosystems: `npm` (weekly) and `github-actions` (weekly, pinned-SHA updates).
- MUST use the grouping pattern from ADR-002 §Implementation Notes: a `npm-minor-and-patch` group that catches `*` with `update-types: ["minor", "patch"]`. Major bumps remain individual PRs.
- MUST pin every third-party Action in `.github/workflows/ci.yml` and `.github/workflows/release.yml` to a commit SHA with the version tag as a trailing comment (e.g., `uses: actions/checkout@<sha>  # v4`).
- MUST NOT pin first-party (`actions/*`) workflows differently — the commit-SHA convention applies to all third-party usage uniformly.
- MUST add a test that scans all workflow files and asserts every `uses:` line either points to a SHA or to a `./local-path`.
- MUST NOT introduce CodeQL, OSV-Scanner, or the auto-merge workflow in this task — those are tasks 13–15.
- MUST NOT modify `release.yml` beyond pinning SHAs in this task — task_16 owns OIDC/provenance/SBOM changes.
</requirements>

## Subtasks
- [x] 12.1 Author `.github/dependabot.yml` with the two ecosystems and the npm grouping rule.
- [x] 12.2 Audit `.github/workflows/ci.yml` and pin every third-party `uses:` to a commit SHA.
- [x] 12.3 Audit `.github/workflows/release.yml` and pin every third-party `uses:` to a commit SHA (limited to SHA pinning only).
- [x] 12.4 Add the SHA-pinning enforcement test.
- [x] 12.5 Verify the Dependabot config is syntactically valid by running `gh dependabot` or equivalent validation locally.

## Implementation Details
See ADR-002 §Decision item 2 for the Dependabot scope and §Implementation Notes for the grouping config. The SHA pinning convention is described in ADR-001 §Decision item 4. Pin SHAs by resolving each `uses:` tag to its current commit SHA at the time of the PR (e.g., `gh api /repos/actions/checkout/git/refs/tags/v4 --jq .object.sha`).

### Relevant Files
- `.github/dependabot.yml` — NEW.
- `.github/workflows/ci.yml` — modify `uses:` lines only.
- `.github/workflows/release.yml` — modify `uses:` lines only (no other changes; task_16 owns the rest).
- `packages/cli/__tests__/workflow-pinning.test.ts` (or root-level test) — NEW.

### Dependent Files
- `.github/workflows/codeql.yml` — task_13 will follow this pinning convention.
- `.github/workflows/osv-scanner.yml` — task_14 will follow this pinning convention.
- `.github/workflows/dependabot-auto-merge.yml` — task_15 will follow this pinning convention.
- `.github/workflows/release.yml` — task_16 builds on this base.

### Related ADRs
- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](../adrs/adr-001.md) — Implements §Decision item 4.
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — Implements §Decision item 2.

## Deliverables
- `.github/dependabot.yml` configured for `npm` and `github-actions`.
- All third-party Actions in existing workflows pinned to commit SHAs.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test scanning all `.github/workflows/*.yml` files for SHA pinning **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `.github/dependabot.yml` parses as valid YAML.
  - [x] `.github/dependabot.yml` includes both `npm` and `github-actions` package-ecosystem entries.
  - [x] `.github/dependabot.yml` configures the `npm-minor-and-patch` group with `update-types: ["minor", "patch"]`.
  - [x] All `uses: third-party/action@<x>` in `ci.yml` and `release.yml` have `<x>` matching a 40-char hex SHA.
  - [x] Each SHA-pinned line includes a trailing version comment.
- Integration tests:
  - [x] Scan every `.github/workflows/*.yml` and `.github/workflows/*.yaml`; assert SHA-pinning on every `uses:` line.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- No third-party `uses:` line in any workflow file uses a mutable tag reference
- Dependabot config validated locally (e.g., via `gh dependabot` or YAML schema check)
