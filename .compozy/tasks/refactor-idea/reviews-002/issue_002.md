---
provider: manual
pr:
round: 2
round_created_at: 2026-05-18T12:56:37Z
status: resolved
file: packages/skills/plugin.json
line: 4
severity: high
author: claude-code
provider_ref:
---

# Issue 002: plugin.json version is not propagated by release tooling

## Review Comment

`packages/skills/plugin.json` hardcodes `"version": "0.1.0"` (line 4) as the Claude Code plugin manifest version. The locked-version release tooling (`scripts/release.mjs` — `propagateVersion()` at lines 103–121) and `propagateVersionToWorkspaces()` in `packages/core/src/commands/release.ts` (lines 287–307) both walk only `package.json` files. Neither touches `plugin.json`.

After the first release, the npm package `@denisvieiradev/gitwise-skills@x.y.z` will ship a `plugin.json` whose `version` still reads `0.1.0`. Claude Code's plugin browser shows that field to users, so the surfaced version will drift from the actual package version forever (until someone updates plugin.json by hand). This is the same class of bug as round 1 issue 002 (cross-package version drift), but for the manifest the release script did not learn to handle.

Suggested fix (pick one):

1. In `scripts/release.mjs` `propagateVersion()`, after writing each workspace `package.json`, also detect a sibling `plugin.json` in the same package directory and patch its `version` field with the same serializer used for `package.json` (2-space indent, trailing newline). Mirror the same logic into `propagateVersionToWorkspaces()` in `packages/core/src/commands/release.ts`.
2. Or, eliminate the field by reading the version from `package.json` at build time and writing it into `dist/plugin.json` via the tsup build, leaving the source file authoritative only for skill metadata.

Option 1 is closer to the current pattern; option 2 removes the dual-source-of-truth altogether.

## Triage

- Decision: `VALID`
- Root cause: Both release entry points (`scripts/release.mjs` `propagateVersion()` and `packages/core/src/commands/release.ts` `propagateVersionToWorkspaces()`) iterate `packages/*/package.json` only. `packages/skills/plugin.json` carries an independent `version` field used by Claude Code's plugin manifest; nothing rewrites it on release, so it drifts from the published npm package version starting with the first bump.
- Chosen fix: Option 1 — extend both propagation paths to also patch a sibling `plugin.json` in each package directory when present. This keeps the source-of-truth dual but synchronized, which matches the rest of the locked-version model and requires no build-pipeline changes. Same 2-space indent + trailing newline serializer is reused so the file's existing formatting is preserved.
- Code changes:
  - `scripts/release.mjs`: after writing each workspace `package.json`, look for a sibling `plugin.json`; if present and its `version` differs, rewrite it with the same `writeJson` helper and include it in the returned `updated` list (so it gets staged by the release commit).
  - `packages/core/src/commands/release.ts`: mirror the same behavior in `propagateVersionToWorkspaces()` using `fileExists` + `readJSON`/`writeJSON`. The commit step already `git add packages` recursively, so no staging changes are needed.
- Tests added:
  - `packages/core/__tests__/unit/commands/release.test.ts`: new case asserts `applyRelease` with `workspacePropagation: true` rewrites a sibling `plugin.json`'s `version` field and leaves other fields untouched.
