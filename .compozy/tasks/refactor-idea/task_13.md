---
status: completed
title: Implement CLI command wrappers for commit, review, pr, and release
type: frontend
complexity: high
dependencies:
    - task_08
    - task_09
    - task_10
    - task_11
    - task_12
---

# Task 13: Implement CLI command wrappers for commit, review, pr, and release

## Overview
Fill in the four placeholder commands in `packages/cli/` with real wrappers that call the corresponding core functions, render the returned plans/drafts via `@clack/prompts`, and apply on user confirmation. Each wrapper translates CLI flags into core options and prints token usage at the end.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `packages/cli/src/commands/commit.ts` MUST accept the positional `intent` argument plus `--split=<auto|never|always>`, `--push`, `--message <m>`, `--no-confirm`, `--base <branch>`; call `commit()`; render a plan via `@clack/prompts.select` (with "execute split", "execute single", "edit", "cancel" options when `kind: "split"`); and call `applyCommitPlan()` on confirm.
- `packages/cli/src/commands/review.ts` MUST accept the positional `intent` plus `--base <branch>` and `--json`; call `review()`; print the `markdown` field by default or `JSON.stringify(result)` when `--json` is set.
- `packages/cli/src/commands/pr.ts` MUST accept the positional `intent` plus `--draft`, `--base <branch>`, `--update`; call `pr()`; render the draft (with edit/confirm/cancel via clack); call `applyPr()` honoring `--draft` on new PRs and the auto-detected existing PR for update.
- `packages/cli/src/commands/release.ts` MUST accept `--bump <patch|minor|major>`, `--language <code>`, `--no-publish`, `--no-gh-release`; call `release()`; render the plan via clack; call `applyRelease()` with `tagAndPush` driven by `--no-publish` and `createGhRelease` driven by `--no-gh-release`.
- Every wrapper MUST print the token usage line (`input: N, output: N`) after the operation, sourced from the returned plan/draft.
- Every wrapper MUST translate typed core errors into single-line user messages and exit with non-zero status; full stack traces only when `GITWISE_DEBUG=1`.
- The `--no-confirm` and `--message` flags on `gw commit` MUST short-circuit the interactive plan render (the plan is applied directly; `--message` overrides the LLM-generated message for single-context plans).
- Shared rendering helpers (e.g., a `renderPlan(plan)` function) MAY live in `packages/cli/src/render.ts` to avoid duplication.
- Tests MUST cover happy path, cancellation, `--no-confirm`, error mapping, and the `--json` review path with `MockLLMProvider` injected via the core's testable seam (e.g., `providerOverride` on each command).
</requirements>

## Subtasks
- [ ] 13.1 Implement `packages/cli/src/commands/commit.ts` with flags, plan rendering, and apply.
- [ ] 13.2 Implement `packages/cli/src/commands/review.ts` with markdown vs JSON output.
- [ ] 13.3 Implement `packages/cli/src/commands/pr.ts` with draft render and create-vs-update branching.
- [ ] 13.4 Implement `packages/cli/src/commands/release.ts` with bump confirmation and apply.
- [ ] 13.5 Add a shared `renderPlan` helper and a typed-error-to-message mapper.
- [ ] 13.6 Replace the placeholder registrations in `packages/cli/src/program.ts` with the real handlers.
- [ ] 13.7 Add tests covering happy paths, cancellation, `--no-confirm`, and the `--json` review path.

## Implementation Details
Reference TechSpec "Implementation Design → API Endpoints" for the exact CLI flag tables. Reference [ADR-003](adrs/adr-003.md) for the contract that core is non-interactive and the CLI owns prompts. Use the existing `__mocks__/ora.ts` for spinner mocks in tests.

### Relevant Files
- `packages/cli/src/commands/{commit,review,pr,release}.ts` — new.
- `packages/cli/src/render.ts` — new (shared rendering helpers).
- `packages/cli/src/program.ts` (from [[task_12]]) — wire the real handlers.
- `__mocks__/ora.ts` — existing, reused.

### Dependent Files
- `packages/core` command exports from [[task_08]]–[[task_11]] are imported here.
- `packages/cli/package.json` (from [[task_12]]) — declare runtime deps `commander`, `@clack/prompts`, `chalk`, `ora`.

### Related ADRs
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — the contract this layer realizes.

## Deliverables
- Four CLI command wrappers fully implemented.
- Shared rendering helper module.
- Real handlers wired in `program.ts`.
- Unit + integration tests **(REQUIRED)**.
- Test coverage 80%+ on `packages/cli` **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `gw commit` (mocked core) renders a single-commit plan and calls `applyCommitPlan` on user confirm.
  - [ ] `gw commit` (mocked core) renders a split plan with N entries and N is shown in the prompt.
  - [ ] `gw commit --no-confirm` calls `applyCommitPlan` without invoking `@clack/prompts.select`.
  - [ ] `gw commit --message "feat: x"` overrides the LLM message for a single-context plan.
  - [ ] `gw commit --push` passes `{ push: true }` into `applyCommitPlan`.
  - [ ] `gw review` prints the `markdown` field by default.
  - [ ] `gw review --json` prints `JSON.stringify(result)`.
  - [ ] `gw pr` calls `applyPr` with `{ draft: true }` when `--draft` is passed and no existing PR.
  - [ ] `gw pr --update` skips the create path when `existingPrNumber` is set.
  - [ ] `gw release --bump minor` passes `bump: "minor"` into `release()`.
  - [ ] `gw release --no-gh-release` passes `createGhRelease: false` into `applyRelease`.
  - [ ] Typed errors from core map to single-line stderr messages and exit code 1.
  - [ ] Every wrapper prints a token usage line on success.
- Integration tests:
  - [ ] End-to-end: in a `mkdtemp` repo with staged changes and `MockLLMProvider` injected, `gw commit --no-confirm` produces a commit in `git log`.
  - [ ] End-to-end: `gw review --json` outputs valid JSON parseable into the `ReviewResult` shape.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- All four wrappers wired into `program.ts`; `gw --help` shows the full flag set per command.
- Cancellation paths exit zero (no work done).
- Errors are user-friendly without debug mode and detailed with `GITWISE_DEBUG=1`.
