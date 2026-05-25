---
status: completed
title: Add OSV-Scanner workflow with expiry-enforced ignore file
type: infra
complexity: low
dependencies: []
---

# Task 14: Add OSV-Scanner workflow with expiry-enforced ignore file

## Overview
Land `.github/workflows/osv-scanner.yml` running OSV-Scanner daily and on every PR, plus an `osv-scanner.toml` ignore file whose entry expiries are enforced by the workflow. Findings with HIGH or CRITICAL severity fail CI; unfixable findings can be acknowledged via the ignore file with a mandatory expiry date that the workflow refuses to silently pass.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `.github/workflows/osv-scanner.yml` using `google/osv-scanner-action` (pinned to a commit SHA per ADR-001 §Decision item 4).
- MUST trigger on `pull_request`, `push: main`, and a daily `schedule` cron.
- MUST fail the workflow on findings with `HIGH` or `CRITICAL` severity.
- MUST create an `osv-scanner.toml` at repo root with the ignore-file schema documented by OSV-Scanner; the initial file may be empty but the schema must be present so future ignores have a place to land.
- MUST enforce expiry on ignore entries: the workflow fails when any entry's `expires` date is in the past, surfacing the offending entry in the failure log.
- MUST add a unit test that fails when an `osv-scanner.toml` entry lacks an `expires` field or has an `expires` in the past.
- MUST NOT replace any existing security checks; this is additive.
- MUST add OSV-Scanner as a required PR check (manual settings step; document in PR description).
</requirements>

## Subtasks
- [x] 14.1 Author `.github/workflows/osv-scanner.yml` with PR / push / daily triggers.
- [x] 14.2 Configure the action to fail on HIGH/CRITICAL.
- [x] 14.3 Add the action SHA pin per task_12 convention.
- [x] 14.4 Create `osv-scanner.toml` at repo root with the documented schema (empty `[[IgnoredVulns]]` ok).
- [x] 14.5 Add an expiry-enforcement step to the workflow (or a script invoked by it) that fails when any entry's `expires` is past.
- [x] 14.6 Add a unit test asserting every entry in `osv-scanner.toml` has a present, future-dated `expires`.

## Implementation Details
See ADR-002 §Decision item 3 and §Implementation Notes for the OSV-Scanner setup. The `osv-scanner.toml` schema is documented in the OSV-Scanner repo; the relevant block uses `[[IgnoredVulns]]` arrays with `id`, `ignoreUntil`, `reason` fields (verify exact key names against the action's current docs). The expiry-enforcement step can be a small bash check or a Node script that reads the toml and exits 1 on stale entries.

### Relevant Files
- `.github/workflows/osv-scanner.yml` — NEW.
- `osv-scanner.toml` — NEW. Empty ignore-file scaffold.
- `packages/cli/__tests__/osv-ignore-expiry.test.ts` (or root-level test) — NEW.

### Dependent Files
- `.github/workflows/dependabot-auto-merge.yml` — task_15 gates auto-merge on OSV-Scanner passing.
- `README.md` — task_18 references OSV-Scanner under the Security section.
- `CONTRIBUTING.md` — task_17 documents how to add an OSV ignore entry with expiry.

### Related ADRs
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — Implements §Decision item 3.
- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](../adrs/adr-001.md) — Action SHAs pinned per §Decision item 4.

## Deliverables
- `.github/workflows/osv-scanner.yml` running on PR, push, and daily schedule.
- `osv-scanner.toml` scaffold at repo root.
- Workflow step or invoked script enforces expiry on ignore entries.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test asserting the workflow YAML is valid and contains the required steps **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `osv-scanner.yml` parses as valid YAML.
  - [x] Triggers include `pull_request`, `push.branches: [main]`, and `schedule.cron`.
  - [x] Uses `google/osv-scanner-action@<sha>` (SHA-pinned).
  - [x] Fails on HIGH/CRITICAL (assert via the action's input — `fail-on-vuln: true`).
  - [x] `osv-scanner.toml` parses as valid TOML.
  - [x] Every `[[IgnoredVulns]]` entry (if any) has a present, future-dated `expires`/`ignoreUntil` field.
  - [x] A fixture `osv-scanner.toml` with a past expiry fails the test (or a deliberate failure simulation succeeds).
- Integration tests:
  - [x] The workflow scaffold runs end-to-end (smoke) against the current repo and reports either zero findings or only known acknowledged ones.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Workflow runs successfully on the PR that introduces it
- An ignore entry with a past expiry deliberately introduced in a fixture branch fails CI (verified before merge)
- Maintainer enables OSV-Scanner as a required status check (out-of-band step, noted in PR description)
