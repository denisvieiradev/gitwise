# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Repo is an npm workspaces monorepo. Root is `private: true`, no `bin` /
  `main` / `files`. Shared `tsconfig.base.json` is the source of truth for
  compiler options. Shared `tsup.config.ts` exports `defineGitwiseTsup` for
  per-package configs and also default-exports the transitional legacy bundle
  config. Shared `jest.config.ts` auto-discovers `packages/*/jest.config.*` via
  the `projects` field.
- `packages/core/` exists as a buildable, tested skeleton
  (`@denisvieiradev/gitwise-core` v1.6.4) with an `exports` map for `.` and
  `./testing`, an empty `templates/` directory, and only a `version` constant
  plus placeholder symbols. Subdirectories (`commands/`, `providers/`,
  `infra/`, `config/`, `template/`, `testing/`) are owned by their respective
  porting tasks (04–10).
- `packages/_placeholder/` has been deleted — with a real workspace present,
  `npm run --workspaces --if-present` no longer errors.
- Legacy `src/cli/index.ts` still builds to `dist/` via `npm run build:legacy`
  and the `__tests__/` suite still passes. Removal happens in task_02 (dead
  pipeline modules) and tasks 03–07 (port into `packages/core`).

## Shared Decisions

- **Legacy runtime deps live under root `devDependencies`** for the duration of
  the transition, with an explicit `external` list on the default tsup config.
  Per-package manifests created in task_03+ MUST declare their own runtime deps
  under `dependencies` (so tsup will externalize them automatically). Do not
  move shared runtime deps back to root `dependencies`.
- **Root `tsconfig.json` no longer pins `rootDir`** — ts-jest needed to compile
  files outside `src/`. Per-package tsconfigs SHOULD pin `rootDir: "src"`
  locally (as `packages/core/tsconfig.json` does); the root one stays unpinned.
- **`version` exports read package.json at runtime via
  `createRequire(import.meta.url)`**, not via a TS JSON import. With per-package
  `rootDir: "src"` pinned, a `import pkg from "../package.json"` raises TS6059
  because the JSON file lives outside the rootDir. The createRequire pattern
  works in both ts-jest ESM and the tsup ESM bundle and resolves correctly from
  both `src/` (dev) and `dist/` (published) because both sit one level above
  `package.json`. Reuse this pattern in `packages/cli` and `packages/skills`.
- **tsup `entry` is the object form whenever a package emits more than one
  bundle** (e.g. `{ index, "testing/index" }`). The array form collapses
  identical basenames (`src/index.ts`, `src/testing/index.ts` would both write
  to `dist/index.js`). The object form maps source paths to explicit output
  paths.

## Shared Learnings

- The repo's `npm run lint` script intentionally runs only `tsc --noEmit` plus a
  workspace fan-out. There is no ESLint invocation. The rtk Bash hook rewrites
  bare `npm run lint` to run ESLint from the wrong cwd, producing a misleading
  failure. Always verify lint via `rtk proxy npm run lint` (or any non-rtk
  invocation) before drawing conclusions.
- The repo currently has **zero git commits** (`git log` fails with "your
  current branch 'main' does not have any commits yet"). Tasks that need a real
  git history to verify behavior (release flows, drift detection, anything that
  reads commit log) must build a `mkdtemp` git fixture and exercise the code
  there. Confirm with `git log --oneline -1` before assuming repo history exists.
- **TS importing `.mjs` from a `.ts` test file under strict ts-jest:** the
  bare import errors with TS7016. The fix is a sibling `.d.mts` declaration
  alongside the script; do NOT switch the root tsconfig to `allowJs`. Pattern
  established in `scripts/release.mjs` + `scripts/release.d.mts`.
- **ts-jest `--coverage` does not cross subprocess boundaries.** Coverage of a
  script's CLI entry-point guard or any code path only reached via
  `node scripts/...` from a subprocess test will appear as uncovered. Add an
  in-process unit test that calls the same code path against a `mkdtemp` fixture
  if you need branch/function coverage above 80%.
- tsup's automatic dep externalization reads the resolved package's
  `dependencies` and `peerDependencies` — not `devDependencies`. Bundles for the
  legacy CLI must list `["@anthropic-ai/sdk", "@clack/prompts", "chalk",
  "commander", "ora"]` as `external` until those deps move into a per-package
  manifest.
- `jest.config.ts` cannot use `import.meta.url` because Jest parses TS config
  via ts-node's CommonJS transpiler regardless of the project's module setting.
  Use `process.cwd()` (jest is always invoked from the repo root in this setup).
- `discoverWorkspaceProjects()` in the root `jest.config.ts` picks up any
  `packages/<name>/jest.config.{ts,js,mjs}` automatically. New packages do not
  need a root-side edit to appear in the test aggregator — just drop a
  `jest.config.ts` in the package.

## Open Risks

- `npm run test:coverage` is below the global 80% threshold (branches 64.62%,
  lines 78.71%, statements 77.95%) on the legacy `src/` tree. This pre-dates
  task_01 — confirmed by running the original `collectCoverageFrom`. task_02
  (dead-module removal) and task_14 (test partitioning) should restore the gate.
  Until then, `npm test` (no `--coverage`) is the gate that must stay green.
- The legacy `__tests__/integration/binary.test.ts` will start failing as soon
  as task_02 removes the deprecated commands (`init`, `prd`, `techspec`,
  `tasks`, `run-tasks`, `test`, `done`, `status`). task_02 must delete or
  rewrite this test in the same change.

## Handoffs

- **For task_11 / task_17 (`gw release` dogfood):** the locked-version
  propagation contract is encoded in `scripts/release.mjs`. Its `propagateVersion`
  and `bumpVersion` functions are the reference implementation; reuse the same
  formatting contract (2-space indent + trailing newline) when porting into
  `core.applyRelease()`. Per ADR-005 the script stays in the repo as the
  Phase 1 fallback.
- **For task_12 (`packages/cli`):** the tag-push workflow
  (`.github/workflows/release.yml`) already fans out via `npm publish
  --workspaces --access public`, so a new package needs no workflow change —
  it just needs its own `"version"` and proper `"publishConfig": { "access":
  "public" }` (or rely on the flag) in its manifest, and the script's
  `listWorkspaceManifests` will pick it up automatically on the next release.
- **For task_02 (delete deprecated devflow surfaces):** the legacy bundle still
  lives at `src/cli/**` and ships via the `build:legacy` script. Removing
  `src/cli/commands/{init,prd,techspec,tasks,run-tasks,test,done,status}.ts`
  also requires updating/removing
  `__tests__/integration/binary.test.ts` and the matching unit tests for those
  commands.
- **For tasks 04–07 (port modules into `packages/core`):** the package skeleton
  is in place. Drop new sources under `packages/core/src/<module>/` and add
  per-module tests under `packages/core/__tests__/<module>/`. Real runtime deps
  go in `packages/core/package.json` `dependencies` (NOT root devDependencies);
  tsup will externalize them automatically once declared there. The placeholder
  exports (`__placeholder__`, `__testingPlaceholder__`) are deletable as real
  exports replace them, but `version` is part of the public API surface and
  stays. Bundled templates land in `packages/core/templates/` (task_06).
