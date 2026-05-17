---
status: completed
title: Implement core.review without techspec coupling
type: backend
complexity: medium
dependencies:
    - task_04
    - task_05
    - task_06
    - task_07
---

# Task 9: Implement core.review without techspec coupling

## Overview
Port the AI-review logic into a non-interactive `review()` function in `packages/core/src/commands/review.ts`. Drop the `techspec.md`-loading code path that devflow used; reviews now operate on the diff plus the user intent alone.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `packages/core/src/commands/review.ts` MUST export `async function review(opts?: ReviewOptions): Promise<ReviewResult>` matching the TechSpec "Core Interfaces" exactly.
- The function MUST diff the current branch against the resolved base branch (auto-detect via the git wrapper or honor `opts.baseBranch`) and pass that diff into the LLM call.
- The function MUST NOT load any techspec or feature-state file; that code path from devflow MUST be eliminated.
- The returned `ReviewResult` MUST split findings into `critical`, `suggestions`, and `nitpicks` arrays and MUST include a `markdown` string that renders all three categories in fixed section order, plus token totals.
- The function MUST use the `powerful` tier by default (per TechSpec "Model tier routing"), overridable via the merged config.
- The function MUST use the new `review.md` template from [[task_06]] rather than an inline string.
- An optional `prompt` field on `ReviewOptions` MUST be threaded into the LLM call.
- Findings parsing MUST handle the same three response shapes the commit parser handles (pure JSON, fenced, brace extraction) or whatever shape the new `review.md` template specifies — the templating decision lives in [[task_06]], but the parser MUST match it.
- Existing review tests under `__tests__/unit/cli/review.test.ts` MUST be relocated and updated; new tests MUST cover the parser, the base-branch resolver, and the empty-diff case.
</requirements>

## Subtasks
- [ ] 9.1 Create `packages/core/src/commands/review.ts` exporting `review()`.
- [ ] 9.2 Port the review logic from `src/cli/commands/review.ts`, deleting the techspec loader path.
- [ ] 9.3 Render via the new `review.md` template ([[task_06]]) and parse the model response into the three-category structure.
- [ ] 9.4 Generate the `markdown` output deterministically from the parsed findings.
- [ ] 9.5 Relocate and expand tests under `packages/core/__tests__/unit/commands/review.test.ts`.

## Implementation Details
Reference TechSpec "Implementation Design → Core Interfaces" for `ReviewOptions` and `ReviewResult`, "Model tier routing" for the default tier, and "Testing Approach" for the mock and `mkdtemp` patterns.

### Relevant Files
- `src/cli/commands/review.ts` — port logic; drop techspec coupling and clack/interactive code.
- `packages/core/src/commands/review.ts` — new file.
- `packages/core/templates/review.md` (from [[task_06]]) — the new prompt.
- `packages/core/src/infra/git.ts` (from [[task_04]]) — provides branch-diff helpers.
- `packages/core/src/providers/factory.ts` (from [[task_05]]) — resolves the provider.
- `packages/core/src/config/merge.ts` (from [[task_07]]) — produces the merged config.
- `__tests__/unit/cli/review.test.ts` — relocate and update.

### Dependent Files
- `packages/cli/src/commands/review.ts` (created in [[task_13]]) — calls `review()` and prints `markdown` (or JSON when `--json` is passed).
- `packages/skills/scripts/review.ts` (created in [[task_14]]) — calls `review()` and emits the markdown for Claude Code.

### Related ADRs
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — drives the non-interactive shape.

## Deliverables
- `packages/core/src/commands/review.ts` implementing `review()`.
- Unit + integration tests with mocked provider and a `mkdtemp` repo **(REQUIRED)**.
- Test coverage 80%+ on the new module **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `review()` returns a `ReviewResult` whose `critical`, `suggestions`, `nitpicks` arrays match the mock LLM's scripted response.
  - [ ] `review()` produces a `markdown` string with the headings "Critical", "Suggestions", and "Nitpicks" in that order.
  - [ ] `review({ baseBranch: "develop" })` diffs against `develop` instead of the auto-detected base.
  - [ ] `review()` throws `EMPTY_DIFF` when there are no changes between the branch and the base.
  - [ ] `review()` uses the `powerful` tier by default and `balanced` when configured.
  - [ ] `review({ prompt })` threads the prompt into the LLM user message.
  - [ ] `review()` does NOT read any `techspec.md` file from the cwd.
- Integration tests:
  - [ ] Against a `mkdtemp` repo with two commits on a feature branch, `review()` returns findings parsed from a canned mock response.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `review()` is exported from `@denisvieiradev/gitwise-core`.
- The function reads no project-level files except git data; it has no path to load `techspec.md`.
