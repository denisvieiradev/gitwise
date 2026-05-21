# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Wired `gw release prepare/finish/abort` as Commander subcommands on the existing `release` command. Shared typed-error formatter maps 10+ codes to `{ message, hint }`. Abort prompts before deleting the release branch with `initialValue: false`. Integration suite added under `packages/core/__tests__/integration/release-lifecycle.test.ts` (gitflow / github-flow / edited-notes / stale-plan / legacy one-shot). Workspace-wide `npm test` clean (27 suites / 403 tests).

## Important Decisions

- Used `cmd.optsWithGlobals()` inside the prepare/finish subcommand handlers. Commander 12 hoists same-named options (`--bump`, `--no-gh-release`, `--no-workspace-propagation`) to the parent when both root and subcommand declare them, leaving the subcommand's own `opts` empty. `optsWithGlobals` merges parent + subcommand and was the cleanest fix without dropping the root flags the task spec mandates.
- The abort prompt peeks at `loadReleasePlan(cwd)` BEFORE calling `abortRelease` so it knows whether to ask about branch deletion at all (github-flow plans never have a branch). The peek's failure is swallowed — `abortRelease` re-loads the plan and surfaces `NO_RELEASE_PLAN` / schema errors through the same shared formatter.
- Made `detectWorkspaceRoot` exported because the integration test file does not need it, but exporting keeps the helper testable and signals intent (it's the single source for workspace auto-detection).

## Learnings

- `git tag -l --format=%(contents)` strips lines starting with `#` (git treats them as comments in tag messages). Integration test for edited-notes uses an underline-style heading instead so the assertion can match a line in the annotation.
- CLI typecheck consumes the BUILT core dist (`@denisvieiradev/gitwise-core`), not the source. After changing the core barrel, `npm run --workspace=@denisvieiradev/gitwise-core build` is required before `npm run typecheck` will succeed.
- `jest.unstable_mockModule` is the ESM-aware replacement for `jest.mock` and MUST be called before the first dynamic `import()` of the module under test. The wiring tests rely on this pattern to stub `@denisvieiradev/gitwise-core` and `@clack/prompts` before importing `makeReleaseCommand`.
- `jest.fn()` in `@types/jest` v29 defaults to `(...args: never[]) => unknown`. Explicit generic (`jest.fn<(...args: unknown[]) => Promise<unknown>>()`) is required when `mockResolvedValue(plan)` would otherwise hit `Argument of type 'X' is not assignable to parameter of type 'never'`.

## Files / Surfaces

- `packages/cli/src/commands/release.ts` — full rewrite to expose root action + 3 subcommands; root delegates to `runReleaseInProcess`, subcommands call core directly. `detectWorkspaceRoot` now exported.
- `packages/cli/src/commands/release-errors.ts` — NEW. `formatReleaseError(err) → { message, hint }` switch keyed on `code` (10 task codes + `RELEASE_BRANCH_UNMERGED` from task_07 + `INVALID_PLAN_JSON` for completeness, plus a generic fallback).
- `packages/cli/__tests__/release-errors.test.ts` — NEW. Coverage for every code + plain-Error + non-Error fallbacks + substring-regression guard.
- `packages/cli/__tests__/release-wiring.test.ts` — NEW. Mocks core + `@clack/prompts`; asserts `--bump` forwarding, `--no-delete-branch` mapping, abort prompt default-no, no `--strategy` flag.
- `packages/cli/__tests__/commands.test.ts` — extended with subcommand presence + flag wiring + ADR-002 strategy-flag absence guard.
- `packages/core/__tests__/integration/release-lifecycle.test.ts` — NEW. Five scenarios per task_09 TechSpec. Mocks `src/infra/github.js` per test via `unstable_mockModule`; LLM stubbed via `MockLLMProvider`.

## Errors / Corrections

- First wiring run failed because Commander 12 hoisted `--bump` / `--no-gh-release` to the parent. Fix: switched subcommand handlers to `cmd.optsWithGlobals()`.
- First integration run failed on github-flow finish with no tag created — I had passed `tagAndPush: false`. Fix: add a bare-origin via `addOrigin(cwd)` and pass `tagAndPush: true`, matching the unit-test pattern.
- First integration run failed on edited-notes test because the heading line started with `#` and git tag stripped it. Fix: use an underline-style heading.
- TypeScript rejected `mockResolvedValue` on default `jest.fn()`. Fix: explicit generic on the mock declarations.

## Ready for Next Run

- Task_10 (release skill update) should mirror the new CLI surface (`prepare`/`finish`/`abort`) in `packages/skills/skills/release.md` and `packages/skills/scripts/release.ts`. The legacy `release()` + `applyRelease()` exports still work and are documented as `@deprecated` in the core — the skill can stay on the legacy path during migration or switch to the subcommands.
- Task_11 (README + CHANGELOG) should document the new `--no-delete-branch` flag and the lifecycle commands. The `gw release --help` output now lists prepare/finish/abort.
- Auto-commit disabled — diff left ready for manual review.
