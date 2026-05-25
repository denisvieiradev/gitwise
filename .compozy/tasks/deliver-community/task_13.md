---
status: completed
title: Add CodeQL SAST workflow
type: infra
complexity: low
dependencies: []
---

# Task 13: Add CodeQL SAST workflow

## Overview
Land `.github/workflows/codeql.yml` running GitHub CodeQL with the JavaScript/TypeScript pack plus the `security-and-quality` and `security-extended` query suites. The workflow runs on every PR to `main` and on a weekly schedule; failures block merge. This is the SAST half of ADR-002.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `.github/workflows/codeql.yml` using the default `github/codeql-action/init` + `analyze` pair, pinned to commit SHAs per ADR-001 §Decision item 4.
- MUST configure the `javascript-typescript` language pack with the `security-and-quality` AND `security-extended` query packs.
- MUST trigger on `push` to `main`, every `pull_request` targeting `main`, and a weekly `schedule` cron.
- MUST request the minimum required permissions: `security-events: write`, `actions: read`, `contents: read`.
- MUST be configured so a HIGH or CRITICAL finding blocks the PR check (default CodeQL behavior — confirm in workflow).
- MUST be added to the repository's "Required status checks" list (manual settings step; document in task PR description).
- MUST NOT duplicate functionality with OSV-Scanner (task_14) — CodeQL is for code SAST, OSV-Scanner is for dependency CVEs.
</requirements>

## Subtasks
- [x] 13.1 Author `.github/workflows/codeql.yml` with init + analyze steps for `javascript-typescript`.
- [x] 13.2 Enable both query suites (`security-and-quality`, `security-extended`).
- [x] 13.3 Pin every Action to its commit SHA following the task_12 convention.
- [x] 13.4 Configure triggers: `push: main`, `pull_request: main`, weekly `schedule`.
- [x] 13.5 Set minimum permissions per principle of least privilege.
- [x] 13.6 Add a workflow-syntax sanity test (parse YAML, assert required keys exist).

## Implementation Details
See ADR-002 §Decision item 1 and §Implementation Notes for the configuration scope. The expected CI time-add is 3–5 minutes per PR (ADR-002 §Consequences). The hotfix-exception process (single-PR allowance for blocked merges) is documented in `CONTRIBUTING.md` and will be added by task_17.

### Relevant Files
- `.github/workflows/codeql.yml` — NEW.
- `packages/cli/__tests__/workflow-codeql.test.ts` (or root-level test) — NEW. Syntax + required-key assertions.

### Dependent Files
- `.github/workflows/dependabot-auto-merge.yml` — task_15 gates auto-merge on CodeQL passing.
- `CONTRIBUTING.md` — task_17 documents the hotfix-exception process referenced in ADR-002.
- `README.md` — task_18 adds the CodeQL status badge.

### Related ADRs
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — Implements §Decision item 1.
- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](../adrs/adr-001.md) — Action SHAs pinned per §Decision item 4.

## Deliverables
- `.github/workflows/codeql.yml` configured with init + analyze, two query suites, three triggers, least-privilege permissions.
- All Action references pinned to commit SHAs.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test verifying workflow YAML is valid and contains the required steps **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `codeql.yml` parses as valid YAML.
  - [ ] Contains `uses: github/codeql-action/init@<sha>` and `uses: github/codeql-action/analyze@<sha>`.
  - [ ] Both `security-and-quality` and `security-extended` appear in the `queries` field.
  - [ ] `language: javascript-typescript` (or both `javascript` and `typescript`) is configured.
  - [ ] Triggers include `push.branches: [main]`, `pull_request.branches: [main]`, and a `schedule.cron`.
  - [ ] `permissions:` block declares `security-events: write`, `actions: read`, `contents: read`.
- Integration tests:
  - [ ] All `uses:` lines in `codeql.yml` are SHA-pinned (consumes task_12's enforcement test if shared).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Workflow runs successfully on the PR that introduces it (verified before merge)
- Findings (if any) are visible in the GitHub Security tab
- Maintainer enables CodeQL as a required status check in repo settings (out-of-band step, noted in PR description)
