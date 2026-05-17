---
status: completed
title: Implement core.commit and applyCommitPlan as non-interactive functions
type: backend
complexity: high
dependencies:
    - task_04
    - task_05
    - task_06
    - task_07
---

# Task 8: Implement core.commit and applyCommitPlan as non-interactive functions

## Overview
Refactor the existing devflow commit command logic from `src/cli/commands/commit.ts` into a non-interactive `commit()` function inside `packages/core/src/commands/commit.ts` and a separate `applyCommitPlan()` function that performs the git mutations. The function returns a typed plan; orchestration of confirmation is left to the CLI ([[task_13]]) and skills ([[task_14]]) layers.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `packages/core/src/commands/commit.ts` MUST export `async function commit(opts?: CommitOptions): Promise<CommitPlan>` matching the TechSpec "Core Interfaces" signatures exactly.
- The function MUST NOT block on user input, MUST NOT call `process.exit`, and MUST NOT use `@clack/prompts` (interactive concerns belong to the CLI layer).
- The multi-context detector and 3-strategy JSON parser (pure JSON → fenced JSON → brace-extraction) MUST be ported from the existing implementation, with no behavioral changes.
- The sensitive-file guard MUST refuse to call the LLM and MUST throw a typed `SENSITIVE_FILE_STAGED` error when any staged file matches the deny patterns (`.env`, `.env.*`, `*.pem`, `*.key`, common credential filenames). The exact pattern set MUST be reused from the existing implementation.
- `split: "auto" | "never" | "always"` MUST drive whether the multi-context split is offered; `"never"` MUST emit a single commit and `"always"` MUST require at least one split.
- The returned `CommitPlan` MUST include `kind`, `commits[]`, and `tokens` exactly as documented.
- A separate `applyCommitPlan(plan, opts?)` function MUST stage each commit's files, run the commit, and optionally push, surfacing typed errors from the git wrapper.
- An optional `prompt` field on `CommitOptions` MUST be threaded into the LLM call as free-form user intent.
- The commit message format MUST honor `commitConvention` from the merged config (`"conventional"` vs `"free"`).
- Tests at `packages/core/__tests__/unit/commands/commit.test.ts` MUST cover the parser strategies, sensitive-file guard, split modes, message formatting, and `applyCommitPlan` mutations against a `mkdtemp` git repo with `MockLLMProvider`.
</requirements>

## Subtasks
- [ ] 8.1 Create `packages/core/src/commands/commit.ts` exporting `commit()` and `applyCommitPlan()` non-interactively.
- [ ] 8.2 Port the multi-context detector and the 3-strategy JSON parser from devflow's commit command.
- [ ] 8.3 Port the sensitive-file guard with the existing deny patterns.
- [ ] 8.4 Wire `commit()` to load the merged config, resolve the provider via the factory, render the `commit.md` template with the diff + prompt, and parse the LLM response into a `CommitPlan`.
- [ ] 8.5 Implement `applyCommitPlan()` using `git.applyCommit` / `git.push` from [[task_04]].
- [ ] 8.6 Add unit + integration tests using `MockLLMProvider` and a `mkdtemp` git repo; relocate and adapt `__tests__/unit/cli/commit.test.ts`.

## Implementation Details
Reference TechSpec "Implementation Design → Core Interfaces" for the `CommitOptions` and `CommitPlan` shapes and "Testing Approach" for the mock and `mkdtemp` patterns. The existing logic in `src/cli/commands/commit.ts` is the source of truth for the parser and the sensitive-file deny patterns.

### Relevant Files
- `src/cli/commands/commit.ts` — port logic (drop clack/interactive code paths).
- `packages/core/src/commands/commit.ts` — new file with `commit()` and `applyCommitPlan()`.
- `packages/core/src/infra/git.ts` (from [[task_04]]) — provides `getStagedDiff`, `applyCommit`, `push`.
- `packages/core/src/template/loader.ts` (from [[task_06]]) — loads `commit.md`.
- `packages/core/src/providers/factory.ts` (from [[task_05]]) — resolves the provider.
- `packages/core/src/config/merge.ts` (from [[task_07]]) — produces the merged config consumed by `commit()`.
- `packages/core/src/testing/mock-llm-provider.ts` (from [[task_05]]) — drives tests.
- `__tests__/unit/cli/commit.test.ts` — relocate and adapt.

### Dependent Files
- `packages/cli/src/commands/commit.ts` (created in [[task_13]]) — will call `commit()` and render the plan via `@clack/prompts`.
- `packages/skills/scripts/commit.ts` (created in [[task_14]]) — will call `commit()` and emit markdown.

### Related ADRs
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — drives the non-interactive shape.
- [ADR-001: gitwise will ship as an orthogonal four-command AI git toolbelt](adrs/adr-001.md) — multi-context splitting is the headline feature.

## Deliverables
- `packages/core/src/commands/commit.ts` implementing both functions.
- Tests covering the multi-context split, sensitive-file guard, and `applyCommitPlan` mutations.
- Unit tests with 80%+ coverage on the new module **(REQUIRED)**.
- Integration tests for `commit` + `applyCommitPlan` against a `mkdtemp` git repo with `MockLLMProvider` **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `commit()` returns `kind: "single"` for a single-context staged diff.
  - [ ] `commit()` returns `kind: "split"` with multiple commits for a multi-context staged diff (LLM scripted via mock).
  - [ ] `commit({ split: "never" })` always returns `kind: "single"`.
  - [ ] `commit({ split: "always" })` throws `NO_SPLIT_POSSIBLE` when the LLM returns a single-context plan.
  - [ ] `commit()` throws `SENSITIVE_FILE_STAGED` when a staged file matches the deny pattern.
  - [ ] `commit({ prompt })` threads the prompt into the LLM call's userMessage.
  - [ ] Parser strategy 1 (pure JSON) handles a well-formed JSON response.
  - [ ] Parser strategy 2 (fenced code) extracts JSON from a markdown ```json block.
  - [ ] Parser strategy 3 (brace extraction) salvages the first balanced `{ ... }` from prose-wrapped output.
  - [ ] `commit()` returns a `CommitPlan` with `tokens.input` and `tokens.output` populated from the mock.
  - [ ] `applyCommitPlan(plan)` stages and commits each plan entry; commits appear in `git log` in plan order.
  - [ ] `applyCommitPlan(plan, { push: true })` invokes `git push` after the last commit.
- Integration tests:
  - [ ] End-to-end: create a `mkdtemp` repo, stage two unrelated files, call `commit()` with `MockLLMProvider` scripted for a split plan, call `applyCommitPlan()`, assert two commits with the expected messages.
  - [ ] End-to-end: staging a file named `.env` produces `SENSITIVE_FILE_STAGED` without any LLM call.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `commit()` and `applyCommitPlan()` are exported from `@denisvieiradev/gitwise-core`.
- The multi-context split behavior matches the pre-refactor devflow output for an identical canned LLM response.
