---
status: completed
title: Overhaul README.md with badges and canonical-doc links
type: docs
complexity: medium
dependencies:
  - task_02
  - task_10
  - task_16
  - task_17
---

# Task 18: Overhaul README.md with badges and canonical-doc links

## Overview
Overhaul `README.md` to expose every decision made in this initiative — CI/CodeQL/provenance badges in the header and dedicated Security, Supply Chain, Governance, and Exit Codes sections each linking out to its canonical doc. Per TechSpec §Development Sequencing this is the final gate before community announcement: nothing decided in this TechSpec lands without a README pointer.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add status badges to the README header for: CI, CodeQL, OSV-Scanner, npm provenance, npm package version (one row per package or a consolidated line).
- MUST add a top-level "Security" section linking to `SECURITY.md` and `CODE_OF_CONDUCT.md`.
- MUST add a "Supply Chain" section linking to `docs/supply-chain.md` (task_17) and `KEYS.asc` (task_11), and including the one-line verification command.
- MUST add a "Governance" section linking to `GOVERNANCE.md` and `CODE_OF_CONDUCT.md` (task_10), and noting the BDFL model honestly.
- MUST add an "Exit Codes" section linking to `docs/exit-codes.md` (task_02) and noting the `--json` envelope from task_04.
- MUST gate the README publish on the `TODO(community-launch)` placeholder in `GOVERNANCE.md` being resolved (task_10's external CoC-reviewer name filled in). Add a pre-commit / test assertion that fails if the placeholder remains.
- MUST preserve all existing useful content (installation, quickstart, command reference) — sections are additive/restructured, not deleted.
- MUST add a brief "Reporting Issues" callout pointing at the issue templates and the CODEOWNERS auto-routing.
- MUST verify all internal links resolve.
</requirements>

## Subtasks
- [x] 18.1 Add the badge row to the README header (CI, CodeQL, OSV-Scanner, provenance, npm version).
- [x] 18.2 Author the four new top-level sections: Security, Supply Chain, Governance, Exit Codes.
- [x] 18.3 Preserve existing installation/quickstart/command-reference content while restructuring.
- [x] 18.4 Add the "Reporting Issues" callout referencing CODEOWNERS auto-routing.
- [x] 18.5 Verify all internal links to `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `KEYS.asc`, `docs/supply-chain.md`, `docs/exit-codes.md`, `docs/recovery.md` resolve.
- [x] 18.6 Add the pre-launch placeholder-resolution check (test fails while `TODO(community-launch)` remains in `GOVERNANCE.md`).
- [x] 18.7 Run the docs site build to confirm README rendering is intact.

## Implementation Details
See TechSpec §Impact Analysis row for `README.md` and §Development Sequencing step 18 for the final-gate framing. Badges follow the conventional `https://img.shields.io/...` and GitHub Actions badge URLs. Keep the badge row to one visual line where possible. The Exit Codes section should be brief (1 paragraph) since the full table lives in `docs/exit-codes.md`.

### Relevant Files
- `README.md` — MAJOR ADDITIONS. Badges + four new sections + reporting callout. Preserve existing useful content.
- `packages/cli/__tests__/readme-content.test.ts` (or root-level test) — NEW. Required-section and link-resolution assertions, plus placeholder-resolution gate.

### Dependent Files
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `KEYS.asc` — all referenced from the new sections.
- `docs/exit-codes.md`, `docs/recovery.md`, `docs/supply-chain.md` — all referenced from the new sections.

### Related ADRs
- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](../adrs/adr-001.md) — Provenance badge + verification one-liner.
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — CI / CodeQL / OSV-Scanner badges.
- [ADR-003: GitwiseError class with stable exit codes](../adrs/adr-003.md) — Exit Codes section.
- [ADR-005: BDFL governance with CODEOWNERS and Contributor Covenant](../adrs/adr-005.md) — Governance section, CoC reference, CODEOWNERS-routing callout.

## Deliverables
- `README.md` with a status-badge row and four new top-level sections (Security, Supply Chain, Governance, Exit Codes) plus a Reporting Issues callout.
- Pre-launch test that fails while `TODO(community-launch)` remains in `GOVERNANCE.md`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test verifying every internal link in `README.md` resolves and the docs site still builds **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] README contains a CI status badge.
  - [x] README contains a CodeQL status badge.
  - [x] README contains an OSV-Scanner status badge.
  - [x] README contains an npm provenance badge.
  - [x] README contains H2 sections "Security", "Supply Chain", "Governance", "Exit Codes" (or canonical equivalents).
  - [x] "Security" section links to `SECURITY.md` and `CODE_OF_CONDUCT.md`.
  - [x] "Supply Chain" section links to `docs/supply-chain.md` and `KEYS.asc` and includes the documented `npm view` verification one-liner.
  - [x] "Governance" section links to `GOVERNANCE.md`.
  - [x] "Exit Codes" section links to `docs/exit-codes.md` and mentions the `--json` envelope.
  - [x] "Reporting Issues" callout references CODEOWNERS routing.
  - [x] Test fails when `TODO(community-launch)` remains anywhere in `GOVERNANCE.md` (placeholder-resolution gate).
- Integration tests:
  - [x] All relative links in `README.md` resolve to existing files (link-check pass).
  - [x] The Astro docs site builds successfully with the updated README content.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Every architectural decision in the TechSpec is reachable from `README.md` (verified by link-check + section presence)
- Placeholder for the external CoC reviewer in `GOVERNANCE.md` is resolved (verified by the gate test)
- README renders cleanly on GitHub and in the docs site (visual spot-check)
