---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: package.json
line: 3
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Monorepo version is 1.6.4 across packages but CHANGELOG declares 0.1.0

## Review Comment

`CHANGELOG.md:8` declares `## [0.1.0] - 2026-05-16 — gitwise refactor` and says "the locked-version monorepo … starts at `0.1.0`". The PRD and ADR-005 also describe a versioning reset. But every `package.json` in the workspace still carries the legacy devflow-cli version `1.6.4`:

- `package.json:3` — `"version": "1.6.4"`
- `packages/core/package.json:3` — `"version": "1.6.4"`
- `packages/cli/package.json:` — `"version": "1.6.4"` (verify)
- `packages/skills/package.json:` — `"version": "1.6.4"` (verify)
- `packages/skills/plugin.json:4` — `"version": "1.6.4"`

If `scripts/release.mjs patch` is run today it will produce `v1.6.5` and CI will publish `@denisvieiradev/gitwise@1.6.5` instead of `0.1.0`, contradicting the CHANGELOG and the marketing surface ("starts at 0.1.0"). The first published version will look like a continuation of devflow-cli rather than a clean reset, defeating the rename narrative.

**Suggested fix**: Set every workspace `package.json` (root + all three packages) and `packages/skills/plugin.json` to `"version": "0.1.0"` before the first release. Verify `scripts/release.mjs` then produces `v0.1.0` → `v0.1.1` on the next `patch` bump as expected.

## Triage

- Decision: `VALID`
- Root cause: CHANGELOG.md:8 announces the rename release as `0.1.0`, but every workspace manifest (root + 3 packages) plus `packages/skills/plugin.json` still carries the inherited devflow-cli version `1.6.4`. `scripts/release.mjs` reads the root `package.json` as the source of truth and would have bumped to `v1.6.5` instead of cutting `v0.1.0`, contradicting both the CHANGELOG and ADR-005.
- Fix: Reset version to `0.1.0` in the five manifests called out by the issue and regenerate `package-lock.json` so the lockfile stays consistent with the workspace manifests.
- Scope note: The batch declares only `package.json` as the in-scope code file, but the discrepancy is identical across `packages/{core,cli,skills}/package.json` and `packages/skills/plugin.json`. Updating only the root would leave the CHANGELOG/manifest mismatch in place — the issue itself enumerates all five files as the required fix surface, so the additional manifests were updated as the minimum needed to actually resolve the reported defect. `package-lock.json` was regenerated via `npm install --package-lock-only` since the previous lockfile mirrored the stale `1.6.4` root version.

### Files changed
- `package.json` — `version` 1.6.4 → 0.1.0
- `packages/core/package.json` — `version` 1.6.4 → 0.1.0
- `packages/cli/package.json` — `version` 1.6.4 → 0.1.0
- `packages/skills/package.json` — `version` 1.6.4 → 0.1.0
- `packages/skills/plugin.json` — `version` 1.6.4 → 0.1.0
- `package-lock.json` — regenerated to mirror the new versions (no other dependency drift)

### Verification
- `npm run typecheck` — passes (3 workspaces, exit 0).
- `npm test` — passes: 19 suites, 208 tests, 0 failures.
- `npm run build` — passes for `core`, `cli`, and `skills` (tsup ESM + DTS builds successful).
- `npm install --package-lock-only` — clean, 0 vulnerabilities; remaining grep for `1\.6\.4` in repo only matches historical entries (`CHANGELOG.md` `[1.6.4]` heading, `.devflow/releases/v1.6.4-release-notes.md`, task memory notes, this issue file, and detached worktrees under `.claude/worktrees/`) — none are publishable artifacts.
- `scripts/release.mjs` smoke check: `bumpVersion('0.1.0', 'patch') => '0.1.1'`, confirming the next `patch` bump produces `v0.1.1` as the issue requires.

### Out of scope (not changed)
- `CHANGELOG.md` `[1.6.4]` historical heading — correctly retained.
- `.devflow/releases/v1.6.4-release-notes.md` — historical artifact.
- `.compozy/tasks/refactor-idea/memory/*` and `.claude/worktrees/*` — task memory / detached workspace copies; not part of the published packages.
- Note for future maintainers: `scripts/release.mjs` only propagates versions to root `package.json` and `packages/*/package.json`; `packages/skills/plugin.json` is NOT updated by the script. After the next release bump the plugin manifest will drift from the package version unless the script is taught about it. Flagging here rather than fixing because it is outside this issue's scope.
