---
status: completed
title: Remove deprecated devflow pipeline surfaces and dead state modules
type: refactor
dependencies: []
complexity: low
---

# Task 2: Remove deprecated devflow pipeline surfaces and dead state modules

## Overview
Delete all source code, templates, and tests for the eight devflow commands and core modules that gitwise explicitly drops (PRD non-goals). This clears the deck so later port tasks only carry forward what gitwise actually keeps and prevents accidentally moving dead code into `packages/core`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- The CLI command files `init.ts`, `prd.ts`, `techspec.ts`, `tasks.ts`, `run-tasks.ts`, `test.ts`, `done.ts`, and `status.ts` under `src/cli/commands/` MUST be deleted.
- The core modules `src/core/pipeline.ts`, `src/core/state.ts`, `src/core/context.ts`, and `src/core/drift.ts` MUST be deleted.
- The infrastructure module `src/infra/update-check.ts` MUST be deleted (the update-checker is dropped at MVP per TechSpec Impact Analysis).
- The bundled templates `templates/prd.md`, `templates/techspec.md`, and `templates/tasks.md` MUST be deleted.
- Every test file under `__tests__/` that exclusively covers a deleted module MUST also be deleted (`pipeline.test.ts`, `state.test.ts`, `context.test.ts`, `drift.test.ts`, `scanner.test.ts` if scanner is dropped, `prd.test.ts`, `techspec.test.ts`, `init.test.ts`, `run-tasks.test.ts`).
- `src/cli/program.ts` and `src/cli/index.ts` MUST be updated so they no longer register deleted commands and so the remaining surface (`commit`, `review`, `pr`, `release`) still launches without referencing removed imports.
- The `src/core/types.ts` file MUST be pruned of any types whose only consumers are deleted modules (e.g., feature/pipeline state types). Types still used by carried-over commands stay.
- The `scanner.ts` module disposition MUST be decided based on whether any carry-over module imports it (TechSpec lists it under "Migrated"); keep it only if `commit`, `review`, `pr`, or `release` references it, otherwise delete it with its test.
- The legacy `src/cli/context.ts` (CLI-side pipeline context loader) MUST be deleted if its only consumers are deleted commands; otherwise stripped to the surface remaining commands require.
- After deletion, `npm run build` and `npm test` MUST still succeed against the leftover source.
</requirements>

## Subtasks
- [ ] 2.1 Delete the eight deprecated CLI command files under `src/cli/commands/`.
- [ ] 2.2 Delete deprecated `src/core/` modules (`pipeline.ts`, `state.ts`, `context.ts`, `drift.ts`) and `src/infra/update-check.ts`.
- [ ] 2.3 Delete deprecated templates (`prd.md`, `techspec.md`, `tasks.md`) under `templates/`.
- [ ] 2.4 Delete all tests that exclusively cover the removed modules under `__tests__/unit/` and `__tests__/integration/`.
- [ ] 2.5 Update `src/cli/program.ts` (and `src/cli/index.ts` / `src/cli/context.ts` as needed) to drop registrations and imports of removed commands while keeping the four carry-over commands wired.
- [ ] 2.6 Prune `src/core/types.ts` of pipeline-only types and evaluate `src/core/scanner.ts` and `src/cli/context.ts` for deletion based on remaining consumers.
- [ ] 2.7 Add or update tests that assert the post-deletion command surface (the remaining program registers exactly `commit`, `review`, `pr`, `release`) and that `npm run build` succeeds.

## Implementation Details
This task only deletes and re-wires the existing tree under `src/`. It does not introduce monorepo layout changes (that is [[task_01]]) and does not move any module into `packages/core` (that begins in [[task_04]]).

The TechSpec Impact Analysis table is authoritative for what is migrated vs. deprecated — see "Impact Analysis" in `_techspec.md`. After this task the remaining surface in `src/` is: `infra/{git,github,filesystem,env,logger}.ts`, `core/{config,template,types,scanner?}.ts`, `providers/*`, and `cli/{program,index,context?}.ts` plus `cli/commands/{commit,review,pr,release}.ts`.

### Relevant Files
- `src/cli/commands/{init,prd,techspec,tasks,run-tasks,test,done,status}.ts` — slated for deletion.
- `src/core/{pipeline,state,context,drift}.ts` — slated for deletion.
- `src/core/{types,scanner}.ts` — pruned or evaluated.
- `src/cli/program.ts` — must stop registering deleted commands.
- `src/cli/index.ts` — entry point; ensure it still boots.
- `src/cli/context.ts` — evaluate for deletion.
- `src/infra/update-check.ts` — slated for deletion.
- `templates/{prd,techspec,tasks}.md` — slated for deletion.
- `__tests__/integration/{prd,init,techspec}.test.ts` and `__tests__/unit/core/{pipeline,state,context,drift,scanner}.test.ts` and `__tests__/unit/cli/run-tasks.test.ts` — slated for deletion.

### Dependent Files
- `src/cli/commands/{commit,review,pr,release}.ts` — imports may currently reach into deleted modules; this task must verify nothing breaks.
- `__tests__/unit/cli/{commit,review,release}.test.ts` — may import helpers from deleted modules; adapt or relocate the helpers to a still-living module.

### Related ADRs
- [ADR-001: gitwise will ship as an orthogonal four-command AI git toolbelt](adrs/adr-001.md) — the basis for which commands stay and which leave.

## Deliverables
- Eight deprecated CLI command files removed.
- Four deprecated core modules and `update-check.ts` removed.
- Three deprecated templates removed.
- Corresponding tests removed.
- `src/cli/program.ts` (and related CLI wiring) compiles and registers only the four carry-over commands.
- Unit tests with 80%+ coverage on the updated `src/cli/program.ts` (assert exactly four registered commands) **(REQUIRED)**.
- Integration test that runs `node dist/cli/index.js --help` and asserts only `commit`, `review`, `pr`, `release` appear in the help output **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] Updated `program.ts` registers exactly four subcommands and no others.
  - [ ] `program.ts` does not throw when invoked with each of the four valid subcommand names.
  - [ ] `program.ts` exits non-zero with an unknown-command message when invoked with `init`, `prd`, `techspec`, `tasks`, `run-tasks`, `test`, `done`, or `status`.
- Integration tests:
  - [ ] `gw --help` output lists only the four supported commands.
  - [ ] `npm test` from the repo root passes with no orphaned imports.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- All listed files deleted; `git ls-files` no longer returns them.
- `npm run build` succeeds against the trimmed source.
- `gw --help` shows only the four carry-over commands.
