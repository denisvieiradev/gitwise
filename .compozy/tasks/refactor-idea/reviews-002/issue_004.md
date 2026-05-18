---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/cli/package.json
line: 30
severity: high
author: claude-code
provider_ref:
---

# Issue 004: Internal workspace dependencies use "*", breaking locked-version on publish

## Review Comment

Two published packages declare their sibling workspace dependency as a wildcard:

- `packages/cli/package.json:30` — `"@denisvieiradev/gitwise-core": "*"`
- `packages/skills/package.json:27` — `"@denisvieiradev/gitwise-core": "*"`

This works inside the monorepo (`npm install` resolves through `workspaces`), but `npm publish --workspaces` (used in `.github/workflows/release.yml:38`) does NOT rewrite plain `*` ranges into the version being published. The tarball uploaded to npm will literally declare `"@denisvieiradev/gitwise-core": "*"`. Consumers installing `@denisvieiradev/gitwise@1.2.3` will then have npm resolve `*` against the registry — picking whatever is currently the latest published version of `gitwise-core`, which may be a much later major release with breaking changes.

ADR-005 explicitly promises locked, in-step versions. Wildcard ranges defeat that guarantee the moment any two releases diverge. This is also the underlying reason the workspace propagator in `scripts/release.mjs` (lines 103–121) can get away with only updating the `version` field today — once these wildcards become exact ranges, the propagator's omission (see related issue) becomes visible.

Suggested fix: replace `"*"` with the exact version string `"0.1.0"` (or `"^0.1.0"` if a permissive minor range is acceptable). Then extend `propagateVersion()` in `scripts/release.mjs` and `propagateVersionToWorkspaces()` in `packages/core/src/commands/release.ts` to also rewrite the `dependencies` and `peerDependencies` entries that reference a sibling workspace package. A test that publishes to a verdaccio sandbox and reinstalls would catch any future regression.

## Triage

- Decision: `VALID`
- Root cause: `npm publish --workspaces` does not rewrite `"*"` ranges into the
  package version being published. The published tarball ships the literal
  wildcard, so a consumer installing `@denisvieiradev/gitwise@0.1.0` lets npm
  resolve `@denisvieiradev/gitwise-core` to whatever is currently `latest` on
  the registry. That defeats the locked-version invariant promised by ADR-005
  the moment any two releases diverge — exactly the scenario the
  release-script propagator (covered by a sibling issue) cannot detect today
  because it only touches `version`.
- Fix applied:
  - `packages/cli/package.json:30` — `"@denisvieiradev/gitwise-core": "*"` →
    `"0.1.0"`. Exact pin chosen over `^0.1.0` to honor ADR-005's "locked,
    shared version across all packages" guarantee verbatim.
  - `packages/skills/package.json:27` — same wildcard → `"0.1.0"`. Out of the
    batch's `<batch_scope>` code-file list, but the review comment explicitly
    flags both sibling packages as suffering from the same defect; leaving
    `skills` on `"*"` would publish the bug under a different package name on
    the very next release. Minimum diff necessary to actually resolve the
    issue as described.
  - `package-lock.json` regenerated via `npm install` to reflect the pinned
    specs (two `"*"` → `"0.1.0"` flips in workspace `dependencies` blocks; no
    new node_modules entries because `gitwise-core` already resolved to the
    workspace).
  - Regression tests added:
    - `packages/cli/__tests__/manifest.test.ts` (new) — asserts the
      `gitwise-core` dependency is never `"*"`, matches an exact-semver shape,
      and stays in lockstep with `packages/core/package.json` `version`.
    - `packages/skills/__tests__/skills.test.ts` (`package.json` describe
      block) — same three assertions for the skills manifest.
- Out of scope for this batch (tracked separately by review comment):
  extending `propagateVersion()` in `scripts/release.mjs` and
  `propagateVersionToWorkspaces()` in `packages/core/src/commands/release.ts`
  to rewrite internal-workspace dep ranges. With the wildcards gone, the
  propagator's omission becomes a real bug surface (next release that leaves
  cli/skills `gitwise-core` pinned to `0.1.0` while bumping core to `0.2.0`
  will ship a broken manifest), but the fix belongs in that sibling issue —
  not here.
- Notes: a verdaccio-sandbox publish/reinstall test as suggested by the
  reviewer would be stronger than the static manifest assertions added here,
  but it requires standing up a registry inside CI and is disproportionate to
  the single-line guard this issue needs. The static assertions cover the
  exact regression mode (`"*"` reappearing in either sibling manifest).
