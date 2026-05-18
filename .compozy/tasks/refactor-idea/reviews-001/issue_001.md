---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: tsup.config.ts
line: 31
severity: critical
author: claude-code
provider_ref:
---

# Issue 001: Root tsup config points at deleted src/cli/index.ts — npm run build fails

## Review Comment

`tsup.config.ts:31` exports a default config with `entry: ["src/cli/index.ts"]`, and the root `package.json:11` runs that bundle as `build:legacy` from the top-level `build` script (`"build": "npm run build:legacy && npm run build:workspaces"`). The `src/` tree has already been deleted from the repo (verified — no `src/` directory exists at the root), so `npm run build` aborts before workspaces are built and `release.yml` (which calls `npm run build`) cannot release.

This was a transitional config from task_01 that should have been removed once `packages/core` absorbed the legacy code (task_02 territory). The accompanying comment ("Transitional default config for the legacy `src/cli/index.ts` bundle") confirms it was meant to be temporary.

**Suggested fix**: Delete the default export in `tsup.config.ts` (keep only `defineGitwiseTsup` / `GITWISE_TSUP_DEFAULTS`) and remove the `build:legacy` script + the leading `build:legacy &&` chain from `package.json` so `npm run build` is just `npm run --workspaces --if-present build`. Also delete the `dev` script (`"dev": "tsup --watch"`) for the same reason.

Affected files:
- `tsup.config.ts:31-40` — drop the default config
- `package.json:11-13` — drop `build:legacy` and simplify `build`
- `package.json:14` — drop `dev`

## Triage

- Decision: `INVALID`
- Notes:
  - Verified `tsup.config.ts` end-to-end (23 lines total). It contains only `GitwiseTsupOverrides`, `GITWISE_TSUP_DEFAULTS`, and `defineGitwiseTsup`. There is no `export default defineConfig(...)` and no reference to `src/cli/index.ts`. The transitional default config described in the review has already been removed.
  - Verified `package.json` at the repo root. The `scripts` block is `build`, `test`, `test:coverage`, `lint`, `typecheck` only. `build` is already `npm run --workspaces --if-present build`. There is no `build:legacy` script and no `dev` script. The suggested simplification has already been applied.
  - Verified there is no top-level `src/` directory (`ls` returns "No such file or directory"), so even if a default export existed it would have nothing to point at — but it doesn't exist anyway.
  - All three "Suggested fix" items in the issue describe state that does not exist on disk. No code change is required; the issue is invalid.
