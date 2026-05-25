---
status: completed
title: Add CODEOWNERS, CODE_OF_CONDUCT.md, and GOVERNANCE.md
type: docs
complexity: low
dependencies: []
---

# Task 10: Add CODEOWNERS, CODE_OF_CONDUCT.md, and GOVERNANCE.md

## Overview
Land the three community-facing governance artifacts mandated by ADR-005: a `.github/CODEOWNERS` routing every path to the BDFL, a verbatim Contributor Covenant 2.1 `CODE_OF_CONDUCT.md`, and a `GOVERNANCE.md` documenting the BDFL model, decision process, and succession plan. These are no-code-dependency tasks that should drop early to set tone before community announcement.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `.github/CODEOWNERS` with a single rule `* @denisvieiradev` (per ADR-005 §Decision item 2).
- MUST create `CODE_OF_CONDUCT.md` containing Contributor Covenant 2.1 verbatim with the enforcement contact replaced by `denisvieira05@gmail.com`. No bespoke language additions.
- MUST create `GOVERNANCE.md` covering: current model (BDFL), decision process (PR review for routine, ADR for significant), SLAs (7-day PR triage, 14-day bug ack, no pre-1.0 release SLA), path to co-maintainership (5 PRs + 3 months + invitation; 12 months + invitation for domain merge rights), conflict resolution (BDFL final tiebreaker, public Discussions for disagreements), and succession (90-day inactivity trigger, named successors placeholder).
- MUST add a placeholder external CoC-escalation reviewer in `GOVERNANCE.md` with a note that the name must be filled before community announcement (task_18 will gate on this being non-placeholder).
- MUST add tests verifying the three files exist, contain the required sections, and that CODEOWNERS matches the expected single-line content.
- MUST NOT touch `README.md`, `SECURITY.md`, or `CONTRIBUTING.md` in this task — task_11/17/18 own those updates.
</requirements>

## Subtasks
- [x] 10.1 Create `.github/CODEOWNERS` with the single ownership rule.
- [x] 10.2 Pull Contributor Covenant 2.1 verbatim into `CODE_OF_CONDUCT.md` with the contact substitution.
- [x] 10.3 Author `GOVERNANCE.md` using ADR-005 §Decision item 3 as the structure.
- [x] 10.4 Add a placeholder for the external CoC reviewer; mark it `TODO(community-launch)` so task_18's pre-launch checks can flag it.
- [x] 10.5 Add presence + content tests so a future deletion or accidental edit fails CI.

## Implementation Details
See ADR-005 §Decision and §Implementation Notes for the exact content scope. CODEOWNERS lives in `.github/CODEOWNERS` (the canonical location). The CoC text is the unmodified Contributor Covenant 2.1 from contributor-covenant.org. GOVERNANCE lives at repo root.

### Relevant Files
- `.github/CODEOWNERS` — NEW. Single ownership rule.
- `CODE_OF_CONDUCT.md` — NEW. Contributor Covenant 2.1.
- `GOVERNANCE.md` — NEW. BDFL governance doc.
- `packages/cli/__tests__/community-docs.test.ts` (or `__tests__/community-docs.test.ts` at repo root) — NEW. Presence assertions.

### Dependent Files
- `README.md` — task_18 will add a Governance section linking to `GOVERNANCE.md` and `CODE_OF_CONDUCT.md`.
- `SECURITY.md` — task_11 will cross-link the CoC contact for non-security conduct reports.
- `CONTRIBUTING.md` — task_17 will reference these documents.

### Related ADRs
- [ADR-005: BDFL governance with CODEOWNERS and Contributor Covenant](../adrs/adr-005.md) — This task implements §Decision items 1–3.

## Deliverables
- `.github/CODEOWNERS` with the documented single rule.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 verbatim, contact substituted).
- `GOVERNANCE.md` covering model, decision process, SLAs, co-maintainer path, conflict resolution, succession.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test verifying the documents exist, contain the required headings, and reference the right contact email **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `.github/CODEOWNERS` exists and is `* @denisvieiradev` (whitespace-tolerant).
  - [x] `CODE_OF_CONDUCT.md` exists, contains the string "Contributor Covenant" and version "2.1".
  - [x] `CODE_OF_CONDUCT.md` contact line includes `denisvieira05@gmail.com`.
  - [x] `GOVERNANCE.md` contains required H2 headings: "Decision Process", "SLA", "Path to Co-maintainership", "Succession".
  - [x] `GOVERNANCE.md` references the 90-day inactivity threshold.
  - [x] `GOVERNANCE.md` contains a `TODO(community-launch)` placeholder for the external CoC reviewer.
- Integration tests:
  - [x] Repo-root markdown lint (if used) does not produce errors on the three new files.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `gh api repos/:owner/:repo/contents/.github/CODEOWNERS` returns the file (post-merge verification not required here)
- All three documents render cleanly on GitHub (visual spot-check by maintainer)
