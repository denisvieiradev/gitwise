# Task Memory: task_01.md

## Objective Snapshot
Completed. Shipped `GitwiseError`, frozen `EXIT_CODES`, and `wrapError` in `packages/core/src/errors.ts`; barrel re-exports added. No throw-site migration (task_03 owns that).

## Important Decisions
- Added a `toJSON()` method on `GitwiseError` so `JSON.stringify` emits `{ name, code, exitCode, message, details? }`. Required to satisfy the techspec `--json` envelope precondition because `Error.message` is non-enumerable by default. `cause` is intentionally excluded from JSON output (it is internal and may hold circular/non-serializable values).
- Typed `EXIT_CODES` as `Readonly<Record<string, number>>` (not `as const`) so the constructor's `EXIT_CODES[args.code]` lookup typechecks under `noUncheckedIndexedAccess`.
- Used `override readonly cause?: unknown` because ES2022 `Error` already declares `cause`.

## Learnings
- Repo enables `noUncheckedIndexedAccess` — any string-indexed lookup yields `T | undefined`, so test helpers had to guard or narrow before arithmetic comparisons.
- Core test script uses `node --experimental-vm-modules .../jest` with the per-package jest.config (`createDefaultEsmPreset`). Run with `npm run -w packages/core test -- --testPathPattern=errors`.

## Files / Surfaces
- New: `packages/core/src/errors.ts`
- Modified: `packages/core/src/index.ts` (+4 lines: error re-exports)
- New: `packages/core/__tests__/unit/errors.test.ts` (18 tests, 100% coverage on errors.ts)

## Errors / Corrections
- First test draft used direct `EXIT_CODES.OK`-style array literals to build a category map; failed TS under `noUncheckedIndexedAccess`. Rewrote into an `inRange(code, min, max)` helper that narrows `undefined`.

## Ready for Next Run
- task_02 (docs/exit-codes.md + parity test) can consume `EXIT_CODES` directly from `@denisvieiradev/gitwise-core`.
- task_03 owns the legacy `Object.assign(new Error...)` → `new GitwiseError(...)` migration. The legacy pattern at three sites is now covered by a `wrapError` integration test (legacy error becomes `code: "UNKNOWN"` with the legacy error as `cause`) — that test will need to be updated/deleted in task_03 once the legacy pattern is gone.
