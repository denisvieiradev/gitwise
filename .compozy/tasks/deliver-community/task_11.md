---
status: completed
title: Publish maintainer GPG public key and update SECURITY.md
type: docs
complexity: low
dependencies:
  - task_10
---

# Task 11: Publish maintainer GPG public key and update SECURITY.md

## Overview
Publish the maintainer's GPG public key as `KEYS.asc` at the repo root and update `SECURITY.md` with the key fingerprint, the supply-chain verification one-liner, and a link to `docs/supply-chain.md` (which task_17 authors). This unblocks signed-tag releases in task_16 and gives community consumers a stable trust anchor for verifying provenance.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `KEYS.asc` at the repo root containing the maintainer's GPG public key in ASCII-armored form.
- MUST append a "Supply Chain" section to `SECURITY.md` that includes the GPG key fingerprint (full 40-character form), a `gpg --verify` example for a signed release tag, and a forward reference to `docs/supply-chain.md`.
- MUST add a "Key Rotation" subsection to `SECURITY.md` describing the procedure for rotating the maintainer key (offline backup location, announcement steps, transition window).
- MUST cross-link `CODE_OF_CONDUCT.md` (task_10) from `SECURITY.md` so non-security conduct reports route to the right document.
- MUST add a test verifying `KEYS.asc` parses as a valid PGP public key block and the fingerprint inside matches the one quoted in `SECURITY.md` (no drift).
- SHOULD note that the GPG key must already exist before this task starts — generation and offline backup is a maintainer-side prerequisite per TechSpec §Technical Dependencies.
- MUST NOT enable signed tags in CI in this task — that is task_16.
</requirements>

## Subtasks
- [x] 11.1 Confirm the maintainer GPG key exists and is backed up in two secured locations (per ADR-005 §Risks and ADR-001 §Consequences).
- [x] 11.2 Export the public key as ASCII-armored `KEYS.asc` and commit it at the repo root.
- [x] 11.3 Append the "Supply Chain" section to `SECURITY.md` with fingerprint, verification example, and forward reference.
- [x] 11.4 Add the "Key Rotation" subsection.
- [x] 11.5 Cross-link `CODE_OF_CONDUCT.md` from `SECURITY.md`.
- [x] 11.6 Add a parity test asserting fingerprint(KEYS.asc) === fingerprint mentioned in SECURITY.md.

## Implementation Details
See ADR-001 §Implementation Notes and §Risks for the key-rotation requirement; the fingerprint format is GPG's standard 40-hex `gpg --fingerprint` output. The verification one-liner referenced in TechSpec §Impact Analysis row for `SECURITY.md` should look like `gpg --verify v<version>.tag.asc`. The parity test can shell out to `gpg --with-fingerprint --show-keys KEYS.asc` and parse the fingerprint, then grep `SECURITY.md`.

### Relevant Files
- `KEYS.asc` — NEW. Maintainer GPG public key.
- `SECURITY.md` — APPEND. Supply Chain + Key Rotation sections, CoC cross-link.
- `packages/cli/__tests__/security-docs.test.ts` (or root-level test) — NEW. Fingerprint parity assertion.

### Dependent Files
- `docs/supply-chain.md` — task_17 authors this and `SECURITY.md` forward-references it.
- `.github/workflows/release.yml` — task_16 uses the GPG key to sign tags; this task publishes its public counterpart.
- `README.md` — task_18 Security section links here.

### Related ADRs
- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](../adrs/adr-001.md) — Implements §Decision item 2 (signed tags require this key) and §Implementation Notes "Add KEYS.asc".
- [ADR-005: BDFL governance with CODEOWNERS and Contributor Covenant](../adrs/adr-005.md) — CoC cross-link.

## Deliverables
- `KEYS.asc` at repo root.
- `SECURITY.md` updated with Supply Chain + Key Rotation sections and CoC cross-link.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test verifying fingerprint parity between `KEYS.asc` and `SECURITY.md` **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `KEYS.asc` exists at repo root and starts with `-----BEGIN PGP PUBLIC KEY BLOCK-----`.
  - [x] `SECURITY.md` contains an H2 section titled "Supply Chain" (or equivalent).
  - [x] `SECURITY.md` contains a 40-character fingerprint matching `[0-9A-F]{40}` or grouped form.
  - [x] `SECURITY.md` contains an H3 "Key Rotation" subsection.
  - [x] `SECURITY.md` links to `CODE_OF_CONDUCT.md`.
- Integration tests:
  - [x] `gpg --with-fingerprint --show-keys KEYS.asc` (or equivalent) produces a fingerprint string identical to the one embedded in `SECURITY.md`.
  - [x] The `gpg --verify` example referenced in `SECURITY.md` is syntactically valid (smoke parse).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Fingerprint shown in `SECURITY.md` matches `KEYS.asc` exactly (parity test asserts this)
- Maintainer can locally produce a signed tag and verify it against `KEYS.asc` (manual smoke step before task_16)
