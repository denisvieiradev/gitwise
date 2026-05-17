# Task Memory: task_03.md

## Objective Snapshot

Stand up `packages/core/` (`@denisvieiradev/gitwise-core` v1.6.4) as a
buildable, tested skeleton with the two-entry `exports` map (`.` and
`./testing`) the later port tasks rely on. Delete `packages/_placeholder/` in
the same change. Ship no product logic.

## Important Decisions

- **`version` is read at runtime via `createRequire(import.meta.url)`** rather
  than imported as JSON. Pinning `rootDir: "src"` (per spec) makes a TS-side
  `import "../package.json"` raise TS6059, and a build-time inline would defeat
  the "version comes from package.json" test. createRequire keeps the source
  inside `src/`, works in both ts-jest ESM and the tsup ESM bundle, and
  resolves correctly from both `src/index.ts` (dev) and `dist/index.js`
  (published) because both sit one level above `package.json`.
- **tsup `entry` is the object form** (`{ index, "testing/index" }`) so the two
  source files produce `dist/index.js` and `dist/testing/index.js`. The array
  form collapses both basenames to `dist/index.js` and overwrites the first.
- **No per-package coverage threshold.** The root `collectCoverageFrom`
  excludes `src/**/index.ts`, so the global 80% gate (still failing on legacy
  `src/`, per task_01 handoff) is not influenced by this stub. The seven new
  tests exercise every line in `src/index.ts` and `src/testing/index.ts`
  regardless.
- **Per-package `jest.config.ts` is minimal** (ts-jest ESM preset +
  `displayName: "core"` + the `.js`-to-source mapper). The root aggregator's
  `discoverWorkspaceProjects()` (added in task_01) picks it up by file
  presence, so no edit to root `jest.config.ts` is needed.
- **`files` field is exactly four entries** (`dist`, `templates`, `README.md`,
  `LICENSE`). The spec says "explicit `files` field MUST list only the
  published artifacts" — a test asserts `files.length === 4` to prevent drift.
- **`packages/_placeholder/` deleted in this change** per the shared-memory
  handoff. With a real workspace present, `npm run --workspaces --if-present`
  no longer errors on an empty `packages/`.

## Learnings

- After installing/removing a workspace, `npm install` from root re-links
  `node_modules/@denisvieiradev/gitwise-core -> ../../packages/core`. The
  `pack`/`unpack` of the previous placeholder shows up in the install summary
  ("added 1 package, removed 1 package").
- Root build pipeline (`npm run build`) runs `build:legacy` then
  `build:workspaces`. The latter is `npm run --workspaces --if-present build`
  and will now pick up `packages/core`'s `tsup` invocation. Legacy bundle
  remains 96.71 KB — the new package does not regress it.

## Files / Surfaces

- Added:
  - `packages/core/package.json`
  - `packages/core/tsconfig.json`
  - `packages/core/tsup.config.ts`
  - `packages/core/jest.config.ts`
  - `packages/core/README.md`
  - `packages/core/src/index.ts`
  - `packages/core/src/testing/index.ts`
  - `packages/core/__tests__/index.test.ts`
  - `packages/core/templates/.gitkeep`
- Deleted: `packages/_placeholder/` (package.json, README.md).
- Untouched (intentionally): root `package.json`, `tsconfig.json`,
  `tsconfig.base.json`, `tsup.config.ts`, `jest.config.ts` — task_01 already
  wired workspaces + auto-discovery; no root edits are needed in this task.

## Errors / Corrections

- First draft used `import pkg from "../package.json"`. Rejected because the
  workspace `tsconfig.json` pins `rootDir: "src"` (per spec) and TS would have
  raised TS6059 on a JSON import outside `src/`. Replaced with the
  `createRequire(import.meta.url)` approach above.

## Ready for Next Run

- 25 suites / 240 tests pass via `npm test` (root aggregator, 2 projects:
  `legacy` 233 + `core` 7).
- `npm run -w packages/core build` produces `dist/index.{js,d.ts}` plus
  `dist/testing/index.{js,d.ts}`; `import('./packages/core/dist/index.js')`
  returns `version: "1.6.4"` and the placeholder symbol.
- `npm run typecheck` and `npm run build` from repo root both exit 0.
- task_03 status flipped to `completed`; `_tasks.md` row updated.
- Diff left uncommitted per `--auto-commit=false`.
- task_04 (port infra modules) is unblocked. The directory `packages/core/src/`
  is empty apart from `index.ts` + `testing/index.ts`; subdirectories
  (`infra/`, `providers/`, `template/`, `config/`, `commands/`) are owned by
  their respective porting tasks.
