# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Published `docs/src/content/docs/exit-codes.md` as the public exit-code contract and added bidirectional parity tests against `EXIT_CODES`.

## Important Decisions
- Parser/diff helper lives at `packages/core/__tests__/_helpers/exit-codes-doc.ts` (test-only). Added `testPathIgnorePatterns: ["/__tests__/_helpers/"]` to `jest.config.ts` so helpers under that folder are not auto-run as test files.
- Added `packages/core/tsconfig.test.json` (rootDir `.`, includes `src` + `__tests__`) and wired `createDefaultEsmPreset({ tsconfig: "tsconfig.test.json" })` so cross-test imports (e.g. test → `_helpers/*.ts`) don't violate `rootDir: src` from the build tsconfig.
- Parser keys on constants wrapped in backticks (`` `NAME` ``) inside the `Constant` column so prose changes in other columns can't accidentally break parsing.

## Learnings
- ts-jest enforces `rootDir` from the active tsconfig even though `__tests__` is in `exclude`. The build tsconfig (`rootDir: src`) blocks any test→test relative import. A second `tsconfig.test.json` resolves this without loosening the build config.
- The default Jest `testMatch` (`**/__tests__/**/*.[jt]s?(x)`) picks up every file under `__tests__/`. Use `testPathIgnorePatterns` (not file naming) to keep test-only helpers out of the suite.

## Files / Surfaces
- NEW `docs/src/content/docs/exit-codes.md` — full table + preamble + shell example.
- NEW `packages/core/__tests__/_helpers/exit-codes-doc.ts` — parser + diff + format.
- NEW `packages/core/__tests__/unit/exit-codes-parity.test.ts` — fixture-based bidirectional drift coverage.
- NEW `packages/core/__tests__/integration/exit-codes-parity.test.ts` — runs against the shipped doc.
- NEW `packages/core/tsconfig.test.json` — test-time tsconfig (rootDir `.`).
- MOD `packages/core/jest.config.ts` — preset wired to `tsconfig.test.json`, added `testPathIgnorePatterns` for helpers.
- MOD `docs/astro.config.mjs` — sidebar now includes `Exit Codes` link.

## Errors / Corrections
- First test run failed with TS6059 (`__tests__/_helpers` outside `rootDir: src`). Fixed by introducing `tsconfig.test.json` and pointing the ts-jest preset at it.

## Ready for Next Run
- task_03 (migrate core throw sites) can rely on the parity test as a CI guardrail: any new code added to `EXIT_CODES` must also be added to `docs/src/content/docs/exit-codes.md` or the integration test fails.
- task_04 (CLI `--json` envelope + hint footer) can hardcode `docs/exit-codes.md` (or the rendered `/exit-codes/` URL) as the hint target — page exists and is in the sidebar.
- task_18 (README overhaul) can link to the Exit Codes page now that it ships with the docs site.
