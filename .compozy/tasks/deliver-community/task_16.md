---
status: completed
title: Harden release.yml with OIDC, npm provenance, SBOM, and signed tags
type: infra
complexity: high
dependencies:
  - task_11
  - task_12
---

# Task 16: Harden release.yml with OIDC, npm provenance, SBOM, and signed tags

## Overview
Transform `.github/workflows/release.yml` into the hardened supply-chain pipeline mandated by ADR-001: replace the long-lived `NPM_TOKEN` with GitHub OIDC, publish each workspace with `--provenance --access public`, generate and upload a CycloneDX SBOM per release, and sign the release tag with the maintainer's GPG key. This is the highest-risk single workflow change in the initiative and must be dry-run-tested against a sibling fork before the first hardened release ships.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `permissions: { id-token: write, contents: write, attestations: write }` to the publish job (id-token for OIDC; contents/attestations for tag + SBOM).
- MUST remove `NPM_TOKEN` from the publish step's env and replace with OIDC trust (npm package settings must already have the trust policy scoped to `denisvieiradev/gitwise` + branch `main` + workflow `release.yml`).
- MUST replace the existing bulk `npm publish --workspaces` with explicit per-workspace `npm publish --provenance --access public` for `packages/core`, `packages/cli`, `packages/skills` (in that order so consumers can resolve from the registry as soon as core is up).
- MUST add a CycloneDX SBOM step using `@cyclonedx/cdxgen` that produces `sbom-${VERSION}.cdx.json`.
- MUST upload the SBOM as a GitHub Release asset via `gh release upload` and call the GitHub artifact-attestations action to attest it.
- MUST sign the release tag using the maintainer GPG key (`git tag -s`); the key's public counterpart was published in task_11.
- MUST keep an emergency-only `NPM_TOKEN` fallback path gated behind an explicit `workflow_dispatch` input toggle (per TechSpec §Known Risks "OIDC misconfig"); the toggle MUST default to OIDC.
- MUST update `release.ts` to require `signTags: true` by default and expose a documented `--no-sign` escape hatch (testing-only).
- MUST keep all third-party Actions SHA-pinned per task_12 convention.
- MUST add a smoke test that runs `cdxgen` against the workspace and asserts the output is a non-empty CycloneDX 1.5 document.
- MUST add a workflow dry-run against a fork before the first hardened production release (manual verification step; recorded in PR description).
</requirements>

## Subtasks
- [x] 16.1 Replace `NPM_TOKEN`-based publish with OIDC + `npm publish --provenance --access public` per workspace.
- [x] 16.2 Add the explicit per-workspace publish order: core → cli → skills.
- [x] 16.3 Add the SBOM generation step (`npx @cyclonedx/cdxgen ...`) and the upload + attestation steps.
- [x] 16.4 Add tag signing via `git tag -s` using the maintainer GPG key (which must be configured on the runner via secrets); document the runner-side GPG setup.
- [x] 16.5 Add the workflow_dispatch input `use_npm_token` (default `false`) for emergency-only fallback; gate the legacy publish path behind it.
- [x] 16.6 Update `release.ts` so `signTags: true` is the default; add the documented `--no-sign` escape hatch with a deprecation/testing warning.
- [x] 16.7 Add the SBOM smoke test and the OIDC step's permission-config integration test.
- [x] 16.8 Document the runner-side GPG configuration and the npm trust policy in the PR description (no automation expected for these out-of-band settings).

## Implementation Details
See TechSpec §Impact Analysis row for `.github/workflows/release.yml` and ADR-001 §Decision + §Implementation Notes for the canonical recipe. Sigstore attestations are produced automatically by `npm publish --provenance` when OIDC is in effect. The CycloneDX 1.5 schema is the current default for `cdxgen`. Runner-side GPG setup typically uses `crazy-max/ghaction-import-gpg` (SHA-pin per task_12).

### Relevant Files
- `.github/workflows/release.yml` — MAJOR REFACTOR. OIDC, provenance, SBOM, signed tag.
- `packages/core/src/commands/release.ts` — change `signTags` default to `true`; add `--no-sign` escape hatch.
- `packages/core/__tests__/release-signing.test.ts` (or extend an existing release test) — NEW. Default-sign behavior.
- `packages/cli/__tests__/release-workflow.test.ts` (or root-level test) — NEW. SBOM smoke + workflow assertions.

### Dependent Files
- `KEYS.asc` (task_11) — public counterpart of the signing key.
- `SECURITY.md` (task_11) — published fingerprint for verification.
- `docs/supply-chain.md` (task_17) — documents how downstream consumers verify the artifacts this workflow produces.
- `README.md` (task_18) — adds the provenance badge.
- `.github/workflows/ci.yml` (task_12) — pinning baseline this builds on.

### Related ADRs
- [ADR-001: Supply-chain integrity via npm provenance, OIDC, signed tags, and SBOM](../adrs/adr-001.md) — Implements §Decision items 1, 2, 3.
- [ADR-002: Automated security and dependency gates in CI](../adrs/adr-002.md) — Pinned-Actions convention.

## Deliverables
- `release.yml` publishes via OIDC + `--provenance` per workspace.
- CycloneDX SBOM generated, uploaded as release asset, and attested.
- Release tag signed with the maintainer GPG key.
- Emergency-only `NPM_TOKEN` fallback gated behind `workflow_dispatch` input.
- `release.ts` defaults to `signTags: true` with a documented `--no-sign` escape hatch.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for SBOM generation and workflow shape assertions **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `release.yml` declares `permissions: id-token: write, contents: write, attestations: write` on the publish job.
  - [x] Publish steps include `--provenance --access public` and target one of the three workspaces explicitly.
  - [x] `NPM_TOKEN` is referenced only inside the emergency-fallback gate (`if: inputs.use_npm_token == true` or equivalent).
  - [x] `workflow_dispatch.inputs.use_npm_token` defaults to `false`.
  - [x] SBOM step uses `@cyclonedx/cdxgen` and writes `sbom-${VERSION}.cdx.json`.
  - [x] Tag-signing step uses `git tag -s` and references the imported GPG key step output.
  - [x] All `uses:` lines SHA-pinned.
  - [x] `release.ts` default options include `signTags: true`.
  - [x] `release.ts` `--no-sign` flag emits a stderr warning.
- Integration tests:
  - [x] `npx @cyclonedx/cdxgen -t npm -o sbom-test.cdx.json .` runs locally and produces a non-empty CycloneDX 1.5 document (guarded by `SBOM_SMOKE=1`; test file: `packages/cli/__tests__/sbom-smoke.test.ts`).
  - [x] SBOM contains all three published workspaces.
  - [x] `release.ts` invoked with default options attempts `git tag -s` (verified via GPG error path in `release-signing.test.ts`).
  - [x] `release.ts` invoked with `--no-sign` falls back to `git tag` without `-s` AND prints the testing-only warning.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Workflow dry-run against a sibling fork (or test repository) publishes a tarball with verifiable provenance and a signed tag (manual step, recorded in PR description)
- `npm view @denisvieiradev/gitwise-core --json | jq .dist.attestations` shows attestations after the first hardened release
- Emergency `NPM_TOKEN` fallback is reachable only via explicit `workflow_dispatch` input
