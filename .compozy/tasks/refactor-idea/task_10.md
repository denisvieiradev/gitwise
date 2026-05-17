---
status: completed
title: Implement core.pr and applyPr with PR-update semantics
type: backend
complexity: medium
dependencies:
    - task_04
    - task_05
    - task_06
    - task_07
---

# Task 10: Implement core.pr and applyPr with PR-update semantics

## Overview
Port the PR-drafting logic into `packages/core/src/commands/pr.ts` as a non-interactive `pr()` function that returns a typed `PrDraft`, and add an `applyPr()` function that creates or updates the PR via `gh`. The `--update` mode (refresh body of an existing PR) is new in gitwise and must be supported by `applyPr`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `packages/core/src/commands/pr.ts` MUST export `async function pr(opts?: PrOptions): Promise<PrDraft>` and `async function applyPr(draft: PrDraft, opts?: { draft?: boolean }): Promise<{ url: string }>` matching the TechSpec "Core Interfaces".
- `pr()` MUST aggregate commits from the current branch versus the resolved base branch and render the `pr.md` template with that context plus the optional `prompt`.
- `pr()` MUST detect an existing PR on the current branch (via `gh pr view`) and populate `PrDraft.existingPrNumber` when present; it MUST NOT throw on existing-PR detection.
- `applyPr(draft)` MUST call `gh pr create` when `existingPrNumber` is unset and `gh pr edit` (body + title) when set; the `--draft` flag MUST be honored only on create.
- When `gh` is not installed or unauthenticated, `applyPr` MUST fall back to printing the title and body to stdout and returning an empty `url` field (graceful fallback per TechSpec).
- The function MUST use the `fast` tier by default (per TechSpec model-tier routing).
- The function MUST NOT use `@clack/prompts` or any interactive primitives.
- Existing tests covering `pr` (if any) MUST be relocated; new tests MUST cover the existing-PR detection, the `--draft` behavior, and the graceful `gh`-missing fallback.
</requirements>

## Subtasks
- [ ] 10.1 Create `packages/core/src/commands/pr.ts` exporting `pr()` and `applyPr()`.
- [ ] 10.2 Port the PR-drafting logic from `src/cli/commands/pr.ts`, eliminating any interactive code paths.
- [ ] 10.3 Add existing-PR detection via the `gh` wrapper from [[task_04]].
- [ ] 10.4 Add update-vs-create branching in `applyPr` and the `gh`-missing fallback.
- [ ] 10.5 Add unit + integration tests with `MockLLMProvider` and a mocked `gh` subprocess.

## Implementation Details
Reference TechSpec "Implementation Design → Core Interfaces" for `PrOptions`, `PrDraft`, and the `applyPr` signature. Reference TechSpec "Integration Points" for the `gh` error-handling contract.

### Relevant Files
- `src/cli/commands/pr.ts` — port logic; drop interactive code; add update path.
- `packages/core/src/commands/pr.ts` — new file.
- `packages/core/templates/pr.md` (from [[task_06]]) — the prompt template.
- `packages/core/src/infra/git.ts` (from [[task_04]]) — supplies `getCommitsSince(base)`.
- `packages/core/src/infra/github.ts` (from [[task_04]]) — supplies `pr.create()`, `pr.edit()`, `pr.view()`, and the availability check.
- `packages/core/src/providers/factory.ts` (from [[task_05]]) — resolves the provider.

### Dependent Files
- `packages/cli/src/commands/pr.ts` (created in [[task_13]]) — calls `pr()` then `applyPr()` with `--draft`/`--update`.
- `packages/skills/scripts/pr.ts` (created in [[task_14]]) — calls `pr()` and emits markdown for Claude Code.

### Related ADRs
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — drives the non-interactive shape.

## Deliverables
- `packages/core/src/commands/pr.ts` implementing `pr()` and `applyPr()`.
- Unit + integration tests with mocked LLM and mocked `gh` **(REQUIRED)**.
- Test coverage 80%+ on the new module **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `pr()` returns a `PrDraft` with title and body populated from the mock LLM response.
  - [ ] `pr({ prompt })` threads the prompt into the LLM call.
  - [ ] `pr()` populates `existingPrNumber` when the `gh` mock reports an open PR on the branch.
  - [ ] `pr()` leaves `existingPrNumber` undefined when no PR is open.
  - [ ] `applyPr(draft)` with no `existingPrNumber` invokes `gh pr create` with the expected argv.
  - [ ] `applyPr(draft, { draft: true })` adds the `--draft` flag on create.
  - [ ] `applyPr(draft)` with `existingPrNumber` invokes `gh pr edit <number>` with `--body` and `--title`.
  - [ ] `applyPr(draft)` returns `{ url: "" }` when `gh` is not available and prints title+body to stdout.
- Integration tests:
  - [ ] Against a `mkdtemp` git repo with two commits on a feature branch and a mocked `gh` binary that reports no existing PR, `pr()` returns a draft and `applyPr()` invokes `gh pr create`.
  - [ ] Same setup but with the mock reporting an open PR #42, `applyPr()` invokes `gh pr edit 42`.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `pr()` and `applyPr()` are exported from `@denisvieiradev/gitwise-core`.
- Both create-new and update-existing PR paths work end-to-end against a mocked `gh`.
