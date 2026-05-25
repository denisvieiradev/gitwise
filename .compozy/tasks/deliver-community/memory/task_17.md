# Task Memory: task_17.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Author `docs/src/content/docs/recovery.md`, `docs/src/content/docs/supply-chain.md`, and append four sections to `CONTRIBUTING.md`. Add `packages/cli/__tests__/docs-presence.test.ts` with presence + content assertions. Verify Astro docs build passes. — COMPLETED.

## Important Decisions
- Sidebar entries added for Recovery and Supply Chain in `docs/astro.config.mjs`.
- stash name format referenced in recovery.md: `gitwise/split-<ISO8601-timestamp>` (exactly as implemented in `packages/core/src/commands/commit.ts:377`).
- supply-chain.md uses `npm view @denisvieiradev/gitwise .dist.attestations` as the canonical one-liner.
- supply-chain.md uses `git tag -v v<version>` as the simpler GPG verification method.
- Test file pattern: mirrors `security-docs.test.ts` — `readFile` + `existsSync`, `findRepoRoot()` helper.
- Astro docs fix: `docs/src/content/config.ts` (legacy collection, NOT `content.config.ts` with docsLoader) was required. Node.js v25.9 + Astro 5.18 + Starlight 0.32 fails to load `content.config.ts` when it imports TypeScript files from `@astrojs/starlight/loaders`. Legacy config works fine.

## Files / Surfaces
- NEW: `docs/src/content/docs/recovery.md`
- NEW: `docs/src/content/docs/supply-chain.md`
- NEW: `docs/src/content/config.ts` (legacy Astro collection config — fixes docs build on Node v25)
- MODIFIED: `docs/astro.config.mjs` (Recovery + Supply Chain sidebar entries)
- MODIFIED: `CONTRIBUTING.md` (four new H2 sections appended)
- NEW: `packages/cli/__tests__/docs-presence.test.ts` (28 tests, all passing)

## Errors / Corrections
- First attempt: `docs/src/content.config.ts` with `docsLoader()` — Astro build produced only 404.html because Node v25.9 can't strip types from `@astrojs/starlight/loaders.ts` (node_modules). Content collection was never loaded.
- Fix: deleted `content.config.ts`, created legacy `docs/src/content/config.ts` with `defineCollection({ schema: docsSchema() })`. 11 pages generated correctly.

## Ready for Next Run
task_17 complete. task_18 (README overhaul) is next and depends on this task's docs URLs: `/recovery/` and `/supply-chain/`.
