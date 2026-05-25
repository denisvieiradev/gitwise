# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
Implemented the user-visible surface of ADR-003: CLI exit-code dispatch, `--json` error envelope on stdout, `--debug` stack traces, `--api-key` deprecation warning, and `gw --version --json` envelope.

## Important Decisions
- Extracted CLI entry logic from `index.ts` into `packages/cli/src/run-cli.ts` so tests can drive the flow in-process with injected writers and a mock `exit`. `index.ts` is now a 3-line bin entry. This was the minimal surface change that allowed end-to-end integration tests without spawning child processes.
- `--json` mode silences `process.stdout.write` and routes the envelope through a captured raw-writer (`rawStdoutWrite`) so clack/chalk progress chatter never leaks. The suppression is skipped when callers pass a custom `stdoutWrite` (tests own their own capture).
- Version envelope shape chosen: `{"version":"x.y.z"}`. Task spec says "mirror envelope shape" but doesn't prescribe a key. Kept it minimal and symmetric to the error envelope (top-level object, no `data` wrapper).
- The version-and-json handler is placed BEFORE the main try/catch in `run-cli.ts` — otherwise the test's `exit` throw is caught and re-wrapped as UNKNOWN/1, masking the intended 0 exit.
- CLI `commit.ts` was refactored to let `GitwiseError` propagate to the top-level handler instead of `p.cancel + process.exit(1)`. Reason: per-command swallowing makes exit-code dispatch impossible. The `formatCommitErrorCancel` helper is left in place (still exported and tested) — it's now dead code in the action body but kept to avoid breaking the public-ish surface and its dedicated tests until a follow-up reconsiders.
- Added an `API_KEY_MISSING` guard in the CLI commit action (`provider === "api" && !apiKey`). Reason: core's `getApiKey()` returns `undefined` silently and the Anthropic SDK throws its own error later — that would have surfaced as `UNKNOWN` (exit 1), not `API_KEY_MISSING` (exit 31). The integration-test requirement made this gap obvious. The guard is at the CLI boundary, not in `createProvider`, to keep core unchanged.
- Hint footer URL: `https://gitwise.dev/exit-codes/ (docs/exit-codes.md)`. Single-line.
- Config-load failure in `commit.ts` was upgraded from `console.error + exit(1)` to `throw new GitwiseError({code:"CONFIG_INVALID"})` so it flows through the new dispatch. Other commands (`pr.ts`, `review.ts`, `release.ts`) still use the legacy `console.error + exit(1)` pattern for config-load failure — out of scope; deferred follow-up.

## Learnings
- `jest.unstable_mockModule("@denisvieiradev/gitwise-core", ...)` with a `...real` spread blew the worker heap (Anthropic SDK + entire commands tree). Replaced with an explicit flat list of mocked exports plus `GitwiseError`/`EXIT_CODES`/`wrapError` re-imported from `../../core/src/errors.js`. `instanceof GitwiseError` still works across the mock boundary because the same class instance is exported on both sides.
- `commander.parseAsync` rejects (not throws), so the top-level catch in `run-cli.ts` sees the promise rejection — wrapping the version path outside the try/catch is required so test-injected `exit(0)` throws aren't caught and re-classified.
- The root-level `npm test` aggregator is broken pre-existing: per-package ts-jest configs reference `tsconfig.test.json` relative to the package, but the root `projects` aggregator resolves it from the repo root and fails. Per-workspace runs (`npm test -w packages/cli`, `npm test -w packages/core`) work correctly. Not in scope for this task.

## Files / Surfaces
- `packages/cli/src/error-handler.ts` (new) — envelope formatters, mode detectors, `handleTopLevelError`.
- `packages/cli/src/run-cli.ts` (new) — extracted CLI entry logic with `RunCliOptions` for test injection.
- `packages/cli/src/index.ts` — minimal bin entry that calls `runCli(process.argv)`.
- `packages/cli/src/program.ts` — added `--json`, `--debug`; rewrote `--api-key` description with `[DEPRECATED — removal planned for v0.next+1]`.
- `packages/cli/src/commands/commit.ts` — config-load failure now throws `GitwiseError(CONFIG_INVALID)`; added `API_KEY_MISSING` guard; the three catch blocks that called `process.exit(1)` now re-throw so the top-level handler dispatches.
- `packages/cli/__tests__/error-handler.test.ts` (new) — unit tests for the handler and formatters.
- `packages/cli/__tests__/run-cli.test.ts` (new) — in-process end-to-end tests driving the full `runCli` flow with a mocked core.
- `packages/cli/__tests__/program.test.ts` — added tests for `--json`, `--debug`, and the `--api-key` deprecation help text.

## Errors / Corrections
- First mock attempt missed transitively-imported `fileExists` (and friends) from `first-run.ts`; jest threw `does not provide an export named 'fileExists'`. Fixed by explicit listing in the mock.
- Second mock attempt used `...real` spread → OOM. Fixed by flat explicit export list.
- `gw --version --json` initially exited 1 instead of 0 because the version path was inside the try/catch and the test's `exit` throw was being re-wrapped. Moved the version handler above the try/catch.

## Ready for Next Run
- Out-of-scope cleanup deferred to future tasks:
  - `pr.ts`, `review.ts`, `release.ts` still call `p.cancel + process.exit(1)` on errors; they should be migrated to re-throw `GitwiseError` so exit-code dispatch works for those commands too. Currently `release.ts` uses `formatReleaseError` which preserves rich hints — migration must preserve those.
  - `formatCommitErrorCancel` is now unused in production but kept exported with tests intact. Either remove (and its tests) or repurpose if richer hints are reintroduced.
  - The `API_KEY_MISSING` guard lives at the CLI layer for `commit`. If a future task wants the guarantee centralized, move it into `createProvider` in core.
  - Root-level `npm test` aggregator (`jest.config.ts` at repo root) is broken — `tsconfig.test.json` is resolved against repo root, not per-package. Workaround: run per-workspace. Worth fixing in a small infrastructure task.
