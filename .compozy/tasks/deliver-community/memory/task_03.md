# Task Memory: task_03.md

## Objective Snapshot
Migrate every `Object.assign(new Error(...))` and bare `throw new Error(...)` site in `packages/core/src/` (and the consuming CLI dispatch + tests) onto `new GitwiseError(...)` from task_01. No control-flow changes; preserve message text; attach the caught error as `cause`. Wire each legacy internal code to a documented `EXIT_CODES` constant via `exitCode` override (or rename when the rename is lossless).

## Important Decisions
- Renames (legacy code → documented EXIT_CODES constant, no `exitCode` override needed):
  - `SENSITIVE_FILE_STAGED` → `SENSITIVE_FILE_BLOCKED`
  - `PROVIDER_UNAVAILABLE` → `API_RATE_LIMITED` (anthropic retry exhaustion only; claude-code.ts `ENOENT` path keeps `PROVIDER_UNAVAILABLE` legacy code + `exitCode: API_FAILED`)
- All other legacy codes are preserved as the `code` string and mapped to an `EXIT_CODES` constant via the constructor's `exitCode` field. This keeps `formatReleaseError`/`formatCommitErrorCancel` switch dispatch in the CLI working unchanged.
- Code → exitCode mapping:
  - `NOTHING_STAGED`, `GIT_FAILED`, `GH_FAILED`, `API_RATE_LIMITED`, `SENSITIVE_FILE_BLOCKED` — auto-resolved (already in `EXIT_CODES`).
  - `COMMIT_HOOK_FAILURE`, `FINISH_MERGE_CONFLICT`, `DIFF_FAILED` → `EXIT_CODES.GIT_FAILED` (20).
  - `NO_BASE_BRANCH`, `WORKING_TREE_DIRTY`, `STRATEGY_DEVELOP_MISSING` → `EXIT_CODES.REPO_STATE_INVALID` (22).
  - `INVALID_VERSION`, `NO_PACKAGE_JSON`, `INVALID_REPO_CONFIG`, `INVALID_PLAN_JSON`, `INVALID_PLAN_SCHEMA`, `TEMPLATE_INVALID_NAME`, `TEMPLATE_NOT_FOUND` → `EXIT_CODES.CONFIG_INVALID` (50).
  - `NO_COMMITS`, `NO_RELEASE_PLAN`, `STALE_PLAN_TAG_EXISTS`, `STALE_PLAN_BRANCH_MISMATCH` → `EXIT_CODES.RELEASE_PLAN_STALE` (60).
  - `RELEASE_PLAN_EXISTS`, `STRATEGY_RELEASE_BRANCH_EXISTS`, `TAG_EXISTS`, `RELEASE_BRANCH_UNMERGED` → `EXIT_CODES.RELEASE_BRANCH_CONFLICT` (61).
  - `NO_SPLIT_POSSIBLE` → `EXIT_CODES.INVALID_INTENT` (11).
  - `EMPTY_DIFF` → `EXIT_CODES.NOTHING_STAGED` (10).
  - `GH_UNAVAILABLE` → `EXIT_CODES.GH_FAILED` (21).
  - `NOTES_READ_FAILED`, `PROVIDER_UNAVAILABLE` (claude-code ENOENT) → leave to default `EXIT_CODES.UNKNOWN` / `EXIT_CODES.API_FAILED`.
- Bare `throw new Error` in `infra/git.ts` (timeouts at :21, :88; parseStatus at :122) → `code: "GIT_FAILED"` with `cause: err` and `details.stderr` when reachable.
- Bare `throw new Error` in `infra/github.ts` (:50, :80, :108) → `code: "GH_FAILED"` with `details: { command }` containing the gh subcommand.
- `infra/env.ts` has no bare `throw new Error` — only an existing pass-through `throw err` at the rename-cleanup site; leave untouched.
- `providers/claude-code.ts` bare `throw new Error` sites (:137/:149/:218) are out of strict task scope (not in the four listed files) — leave untouched; only the `Object.assign` site at :241 is migrated.
- `details.stderr` is wired in `infra/git.ts` wrappers and `infra/github.ts` where the underlying `exec` error exposes `.stderr` — task_04 (`--json` envelope) will surface it.

## Learnings
- Many existing tests assert `code: "<legacy>"` via `toMatchObject`. Preserving legacy code strings (with overridden `exitCode`) keeps those tests passing untouched. Only `SENSITIVE_FILE_BLOCKED` and `API_RATE_LIMITED` renames require test updates.
- CLI consumers of `code` (`packages/cli/src/commands/{commit,release-errors}.ts`) dispatch on the legacy string. Preserving the strings avoids breaking those dispatch maps; the only CLI update needed is the `SENSITIVE_FILE_BLOCKED` rename.
- Existing `wrapError` legacy-passthrough test (`errors.test.ts`) constructs its own `Object.assign(new Error,...)` and is therefore unaffected by removing the same pattern from production code.

## Files / Surfaces
- packages/core/src/
  - infra/git.ts (2 timeouts, parseStatus, NO_BASE_BRANCH, COMMIT_HOOK_FAILURE)
  - infra/github.ts (3 empty-output throws)
  - providers/anthropic.ts (PROVIDER_UNAVAILABLE → API_RATE_LIMITED)
  - providers/claude-code.ts (PROVIDER_UNAVAILABLE Object.assign at line 241 — kept legacy code, exitCode: API_FAILED)
  - commands/commit.ts (NOTHING_STAGED, SENSITIVE_FILE_BLOCKED rename, NO_SPLIT_POSSIBLE)
  - commands/release.ts (16 sites — list above)
  - commands/release-plan.ts (3 sites)
  - commands/pr.ts (NO_COMMITS, GH_UNAVAILABLE)
  - commands/review.ts (DIFF_FAILED, EMPTY_DIFF)
  - config/repo.ts (INVALID_REPO_CONFIG)
  - template/loader.ts (TEMPLATE_INVALID_NAME, TEMPLATE_NOT_FOUND)
- packages/cli/src/commands/commit.ts (formatCommitErrorCancel switch — rename SENSITIVE_FILE_STAGED → SENSITIVE_FILE_BLOCKED)
- tests touched:
  - packages/core/__tests__/unit/commands/commit.test.ts (rename SENSITIVE_FILE_STAGED → SENSITIVE_FILE_BLOCKED)
  - packages/core/__tests__/unit/providers/anthropic.test.ts (rename PROVIDER_UNAVAILABLE → API_RATE_LIMITED)
  - packages/core/__tests__/unit/infra/git.test.ts (add GIT_FAILED / GitwiseError type assertions; keep COMMIT_HOOK_FAILURE)
  - packages/core/__tests__/unit/infra/github.test.ts (add GH_FAILED tests with execFile mocked)
  - packages/core/__tests__/unit/commands/release.test.ts (add GitwiseError instanceof assertions on representative paths; legacy code assertions remain valid)
  - packages/core/__tests__/integration/release-prepare.test.ts / release-lifecycle.test.ts (no rename required)
- Integration tests added (new file): __tests__/integration/error-migration.test.ts
  - End-to-end `commit` no-staged → GitwiseError + code NOTHING_STAGED
  - End-to-end `prepareRelease` invalid plan (stale baseCommit) → GitwiseError + code RELEASE_PLAN_EXISTS

## Errors / Corrections
- Initial `pr.ts` migration left `details: { draft }` — `draft` is the function parameter (PrDraft object), not the boolean opt. Test updated to assert `details: { draft }` matches the full PrDraft (CLI consumers use outer-scope `draft`, so the runtime contract is unchanged).
- `release.ts` FINISH_MERGE_CONFLICT previously decorated the legacy Object.assign with top-level `target`/`source`/`newVersion`. Migration moved these into `details` per GitwiseError shape. `release-lifecycle.test.ts` integration test updated accordingly.
- `github.test.ts` `instanceof GitwiseError` failed under `jest.resetModules()` due to module-instance divergence. Fix: re-import `GitwiseError` after `jest.unstable_mockModule(...)` so both module copies match.

## Ready for Next Run
- All 23 core test suites (377 tests) green; CLI 8 suites (89 tests) green.
- `grep -rn "Object\.assign(new Error" packages/core/src/` returns zero matches.
- Aggregate core coverage: 86.51% statements, 87.32% lines (above the 80% target).
- Per-file coverage on changed files: errors.ts 100%, anthropic.ts 100%, repo.ts 100%, loader.ts 100%, commit.ts 93.26%, release.ts 95.82%, release-plan.ts 96.25%, review.ts 86.95%, git.ts 90.26%, github.ts 79.06%, pr.ts 76.59% (no new uncovered branches introduced by this task).
- New integration test: `__tests__/integration/error-migration.test.ts` covers commit NOTHING_STAGED + prepareRelease RELEASE_PLAN_EXISTS end-to-end.
- task_04 (CLI dispatch) can now switch on `err.exitCode` and rely on every legacy code-string being preserved as `code` with the correct `exitCode` override.
