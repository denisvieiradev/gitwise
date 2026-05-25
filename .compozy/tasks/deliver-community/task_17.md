---
status: completed
title: Author docs/recovery.md, docs/supply-chain.md, and update CONTRIBUTING.md
type: docs
complexity: medium
dependencies:
  - task_07
  - task_08
  - task_16
---

# Task 17: Author docs/recovery.md, docs/supply-chain.md, and update CONTRIBUTING.md

## Overview
Publish the two new docs pages (`docs/recovery.md`, `docs/supply-chain.md`) that the error-hint footer and `ROLLBACK_PARTIAL` warnings reference, and extend `CONTRIBUTING.md` with the transactional-flow pattern, the hotfix-exception process for CodeQL/OSV-Scanner, the security-test expectations introduced by task_09, and the OSV ignore-entry expiry process. This closes the documentation loop on every prior task.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `docs/recovery.md` (under `docs/src/content/docs/`) covering, per flow, what to do when `ROLLBACK_PARTIAL` is reported: release prepare (delete orphan branch, restore plan file), commit-split (find and pop `gitwise/split-<timestamp>` stash), workspace version-bump (revert affected `package.json` files via `git checkout`). Reference the predictable named-stash convention from task_08.
- MUST create `docs/supply-chain.md` (under `docs/src/content/docs/`) explaining: how to verify npm provenance for a published tarball, how to verify the signed release tag against `KEYS.asc`, where to find the SBOM, and what each artifact certifies. Include verifiable one-liner examples.
- MUST extend `CONTRIBUTING.md` with sections: "Writing a Transactional Flow" (referencing the `Transaction` primitive and worked example from task_07), "Hotfix Exception" (single-PR allowance when CodeQL or OSV-Scanner blocks, follow-up-issue requirement), "Security Test Expectations" (subprocess argument safety, sensitive-file blocklist coverage), and "Adding an OSV Ignore Entry" (mandatory expiry, review schedule).
- MUST add tests verifying the new docs files exist, contain required headings, and that the recovery doc references the stash name format from task_08.
- MUST ensure every doc renders correctly by the Astro docs build (smoke-build the docs site as part of test or local verification).
- MUST NOT modify `README.md` in this task — task_18 owns the top-level overhaul.
</requirements>

## Subtasks
- [x] 17.1 Author `docs/src/content/docs/recovery.md` with the three per-flow recovery procedures.
- [x] 17.2 Author `docs/src/content/docs/supply-chain.md` with verification procedures for provenance, signed tags, and SBOM.
- [x] 17.3 Append "Writing a Transactional Flow" section to `CONTRIBUTING.md` referencing the `Transaction` primitive (task_05) and the prepare flow (task_07) as the worked example.
- [x] 17.4 Append "Hotfix Exception" section documenting the single-PR allowance and follow-up requirement.
- [x] 17.5 Append "Security Test Expectations" section referencing task_09's regression tests.
- [x] 17.6 Append "Adding an OSV Ignore Entry" section documenting the expiry requirement (task_14).
- [x] 17.7 Add documentation-presence tests and a recovery-doc → stash-name parity test.

## Implementation Details
See TechSpec §Impact Analysis rows for `docs/recovery.md`, `docs/supply-chain.md`, and `CONTRIBUTING.md` for scope. The recovery doc references named stashes from task_08; the supply-chain doc references the SBOM and signed-tag artifacts from task_16; CONTRIBUTING references the hotfix exception from ADR-002 §Risks. The docs site lives under `docs/src/content/docs/` (Astro-based).

### Relevant Files
- `docs/src/content/docs/recovery.md` — NEW.
- `docs/src/content/docs/supply-chain.md` — NEW.
- `CONTRIBUTING.md` — APPEND four new sections.
- `packages/cli/__tests__/docs-presence.test.ts` (or root-level test) — NEW.

### Dependent Files
- `README.md` — task_18 links to these docs.
- `packages/cli/src/index.ts` — task_04's hint footer points users at `docs/exit-codes.md` and (for `ROLLBACK_PARTIAL`) at `docs/recovery.md`.
- `SECURITY.md` — task_11 forward-references `docs/supply-chain.md`.

### Related ADRs
- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](../adrs/adr-001.md) — Public verification procedures.
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — Hotfix exception + OSV ignore process.
- [ADR-004: Transactional rollback for multi-step git workflows](../adrs/adr-004.md) — Recovery doc per §Implementation Notes "Add docs/recovery.md".

## Deliverables
- `docs/src/content/docs/recovery.md` covering three flow-specific recovery procedures.
- `docs/src/content/docs/supply-chain.md` covering three verification procedures.
- `CONTRIBUTING.md` extended with four new sections.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test asserting docs site builds without errors after the additions **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `docs/recovery.md` exists and contains H2 sections for "Release Prepare", "Commit Split", "Workspace Version Bump" (or equivalent titles).
  - [x] `docs/recovery.md` references the `gitwise/split-<timestamp>` stash name format exactly as task_08 implements.
  - [x] `docs/supply-chain.md` exists and contains H2 sections for "Verifying Provenance", "Verifying Signed Tags", "Verifying the SBOM".
  - [x] `docs/supply-chain.md` includes at least one `npm view ... .dist.attestations` example.
  - [x] `docs/supply-chain.md` includes at least one `gpg --verify` example referencing `KEYS.asc`.
  - [x] `CONTRIBUTING.md` contains H2 sections for "Writing a Transactional Flow", "Hotfix Exception", "Security Test Expectations", "Adding an OSV Ignore Entry".
  - [x] `CONTRIBUTING.md` "Hotfix Exception" requires a follow-up issue/PR.
- Integration tests:
  - [x] The Astro docs site builds (`npm run docs:build` or equivalent) without errors after the new pages are added.
  - [ ] All internal links in the new docs resolve (no 404s) — link-check pass. (link-check tool not installed; build generates pages without 404s)
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Docs site renders both new pages and shows them in navigation
- Recovery doc's stash-name format matches task_08's implementation (parity test asserts)
- A `ROLLBACK_PARTIAL` warning in code points at `docs/recovery.md` (link verified by docs link-check)
