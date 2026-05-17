# Task Memory: task_01.md

## Objective Snapshot

Convert the gitwise repo from a single-package layout into an npm workspaces
monorepo (root + `packages/*`), wire shared `tsconfig.base.json`, a shared
`tsup` helper, and a `projects`-based jest aggregator, while keeping the
legacy `src/cli/index.ts` build and `__tests__/` suite green.

## Important Decisions

- **Legacy runtime deps moved to root `devDependencies`** (instead of being
  deleted outright). The task spec asks for them to be removed from `dependencies`,
  but the same spec also requires `src/` to keep building until task_02–task_07.
  Keeping them under `devDependencies` on the private root satisfies both: they
  are not declared as ship-deps of the root (root is `private: true` anyway and
  has no `files`/`bin`), but they remain installed and hoisted so the legacy
  bundle resolves.
- **Explicit `external` list on the legacy `tsup` default config.** With runtime
  deps in `devDependencies`, tsup no longer auto-externalizes them via
  `package.json`, which caused the bundle to balloon from 96.71 KB to 1.01 MB
  and break at runtime (`Dynamic require of "events" is not supported` from a
  bundled commander). The default export now lists the legacy externals
  explicitly. Per-package configs in task_03+ should declare their own runtime
  deps in their own `dependencies` and tsup will externalize them automatically.
- **`packages/_placeholder/`** is the placeholder package the spec allows. A
  bare `.gitkeep` was insufficient because `npm run --workspaces --if-present`
  fails with "No workspaces found!" when zero workspaces exist. The placeholder
  defines no-op `build`/`test`/`lint`/`typecheck` scripts. Delete it as soon as
  the first real package (`core`) lands in task_03.
- **Root `tsconfig.json` no longer pins `rootDir: "src"`.** ts-jest was tripping
  on TS6059 when compiling tests that import the root-level `tsup.config.ts`.
  Removing the explicit rootDir restores test compilation without affecting
  `tsc --noEmit` (still scoped via `include: ["src"]`).
- **`jest.config.ts` uses `process.cwd()` instead of `import.meta.url`.** Jest
  parses TS config via ts-node's CommonJS transpiler, which rejects
  `import.meta` regardless of the `--module` setting in the project tsconfig.

## Learnings

- The root `npm run lint` script in this repo only runs `tsc --noEmit` plus a
  workspace fan-out — it does **not** invoke ESLint. The rtk Bash hook rewrites
  bare `npm run lint` to run ESLint from whatever directory the shell sees as
  cwd (musit-app), producing a misleading failure log. Use `rtk proxy npm run
  lint` (or any non-rtk-wrapped invocation) to see the real exit code.
- `npm run --workspaces --if-present <script>` errors out ("No workspaces
  found!") when the workspaces glob resolves to zero packages, even though it
  silently no-ops when packages exist but lack the script. That is why a
  placeholder package is required for the transitional state.
- tsup's auto-externalization only inspects `dependencies` and
  `peerDependencies` of the resolved package.json; moving deps to
  `devDependencies` causes them to be bundled. Confirmed by reproducing the
  1.01 MB output and a runtime CJS/ESM dynamic-require crash.

## Files / Surfaces

- Edited: `package.json`, `tsconfig.json`, `tsup.config.ts`, `jest.config.ts`,
  `CONTRIBUTING.md`.
- Added: `tsconfig.base.json`, `packages/_placeholder/package.json`,
  `packages/_placeholder/README.md`,
  `__tests__/unit/build/tsup-config.test.ts`,
  `__tests__/unit/build/tsconfig-base.test.ts`,
  `__tests__/integration/workspaces.test.ts`.
- Untouched legacy surfaces still in play (out of scope for task_01, handled by
  task_02 / task_04+): `src/**`, existing `__tests__/**`, `__mocks__/ora.ts`,
  `templates/**`.

## Errors / Corrections

- Initial pass left runtime deps as `dependencies` to be safe → corrected to
  `devDependencies` to honor the spec while still satisfying the "src/ keeps
  building" constraint via tsup `external`.
- First jest.config.ts revision used `import.meta.url` → parse error in ts-node.
  Replaced with `process.cwd()`.
- First test pass failed with TS6059 because rootDir was pinned to `src`.
  Removed the pin from `tsconfig.json`.

## Ready for Next Run

- 24 test suites / 233 tests pass; helper has 100% coverage; CLI binary still
  works (`node dist/index.js --version` → 1.6.4).
- `npm run test:coverage` still fails the global 80% gate because of pre-existing
  legacy `src/` coverage (branches 64.62%, lines 78.71%, statements 77.95%) — the
  same numbers reproduce with the *original* `collectCoverageFrom`, so the gap
  pre-dates task_01. task_02 (legacy removal) and task_14 (test partitioning)
  are the right places to repair it. **Do not** chase coverage in task_01.
- Tracking-only files (task_01.md status, _tasks.md row) are updated; auto-commit
  is disabled per task input, so the diff is left ready for manual review.
