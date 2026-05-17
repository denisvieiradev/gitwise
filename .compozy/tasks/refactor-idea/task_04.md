---
status: completed
title: Port infra modules (git, github, filesystem, env, logger) into core
type: refactor
complexity: medium
dependencies:
    - task_02
    - task_03
---

# Task 4: Port infra modules (git, github, filesystem, env, logger) into core

## Overview
Move the five preserved infrastructure modules from `src/infra/` into `packages/core/src/infra/`, keeping behavior identical while adapting imports to the new package layout. These are the foundations every command function and provider relies on.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `src/infra/git.ts`, `src/infra/github.ts`, `src/infra/filesystem.ts`, `src/infra/env.ts`, and `src/infra/logger.ts` MUST be moved to `packages/core/src/infra/` and exported through `packages/core/src/index.ts` under a stable internal API surface.
- Imports within each module MUST be updated to use relative paths inside `packages/core`; cross-package imports MUST go through the `@denisvieiradev/gitwise-core` entry only.
- The `src/infra/update-check.ts` module MUST NOT be ported (it was deleted in [[task_02]]).
- Public behavior MUST remain identical to the existing devflow implementations; refactors limited to import paths and unused-export cleanup.
- The logger MUST continue to gate debug output on a `GITWISE_DEBUG=1` env variable (renamed from any `DEVFLOW_DEBUG` reference if present).
- The `git` wrapper MUST surface the same typed error codes used by carry-over commands and MUST detect the base branch (`main` then `master`) for the `--base` resolver downstream tasks expect.
- The `github` wrapper MUST detect `gh` availability and version, and MUST expose helpers used by [[task_10]] (`pr` create/update) and [[task_11]] (`release` create).
- Corresponding tests under `__tests__/unit/infra/` MUST be relocated to `packages/core/__tests__/unit/infra/` and updated to import from the new module paths; coverage MUST stay at or above 80%.
- Once relocation is complete, the legacy `src/infra/` files MUST be deleted.
</requirements>

## Subtasks
- [ ] 4.1 Move `git.ts`, `github.ts`, `filesystem.ts`, `env.ts`, `logger.ts` from `src/infra/` to `packages/core/src/infra/` and update internal imports.
- [ ] 4.2 Add per-module exports inside `packages/core/src/infra/index.ts` and re-export from `packages/core/src/index.ts`.
- [ ] 4.3 Normalize environment-variable names to the `GITWISE_*` prefix (especially `GITWISE_DEBUG`).
- [ ] 4.4 Move corresponding unit tests to `packages/core/__tests__/unit/infra/` and update import paths.
- [ ] 4.5 Verify `git.ts` exposes base-branch detection, staged-diff readers, sensitive-file scanning helpers (or coordinate that helper into [[task_08]] if currently inline), commit application, and push.
- [ ] 4.6 Delete the now-empty `src/infra/` directory and confirm no stale imports remain via a typecheck.

## Implementation Details
Follow TechSpec "Implementation Design → Integration Points" for which behaviors each module owns. The TechSpec impact table marks these modules as `Migrated`; carry them across without redesigning interfaces.

### Relevant Files
- `src/infra/git.ts` — port verbatim aside from import paths and env-var rename; consumed by all four commands and by `applyCommitPlan`, `applyPr`, `applyRelease`.
- `src/infra/github.ts` — port; consumed by `pr` and `release` apply paths.
- `src/infra/filesystem.ts` — port; consumed by config and template loaders.
- `src/infra/env.ts` — port; reads from process env and `~/.gitwise/.env` (env-file read details land in [[task_07]] but the basic helper moves here).
- `src/infra/logger.ts` — port; gate on `GITWISE_DEBUG`.
- `__tests__/unit/infra/git.test.ts`, `__tests__/unit/infra/env.test.ts`, `__tests__/unit/infra/logger.test.ts` — relocate.

### Dependent Files
- `packages/core/src/index.ts` — adds infra re-exports.
- Future consumers in [[task_05]], [[task_06]], [[task_07]], and [[task_08]]–[[task_11]] — will import infra from `@denisvieiradev/gitwise-core` internal paths.
- `src/cli/commands/{commit,review,pr,release}.ts` — still under `src/` for now; their imports do NOT need to change in this task because [[task_13]] will replace them.

### Related ADRs
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — establishes that core owns infra.

## Deliverables
- Five infra modules ported into `packages/core/src/infra/`.
- Their unit tests relocated to `packages/core/__tests__/unit/infra/` with imports updated.
- `packages/core/src/index.ts` exports the infra API expected by downstream tasks.
- Legacy `src/infra/` directory removed.
- Unit tests with 80%+ coverage on each ported module **(REQUIRED)**.
- Integration test exercising the `git` wrapper against a temp repo created via `mkdtemp` **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `git.detectBaseBranch()` returns `main` when both `main` and `master` exist, falls back to `master`, and throws `NO_BASE_BRANCH` when neither exists.
  - [ ] `git.getStagedDiff()` returns the staged unified diff for a sample repo and an empty string when nothing is staged.
  - [ ] `git.applyCommit({ message, files })` invokes `git add <files>` then `git commit -m <message>` and surfaces a typed error on a hook failure.
  - [ ] `github.isGhAvailable()` returns false when `gh` is absent and true with a sample version stub when present.
  - [ ] `env.read()` reads `ANTHROPIC_API_KEY` from `process.env` and from a temp `.env` file fixture with `0600` permissions.
  - [ ] `logger.debug()` is silent when `GITWISE_DEBUG` is unset and writes to stderr when set.
- Integration tests:
  - [ ] In a `mkdtemp` git repo, staging a file and calling `git.applyCommit` produces a commit visible in `git log`.
  - [ ] `github.openPr()` (mocking the `gh` CLI subprocess) emits the expected argv when the `gh` binary is available.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- No imports under `packages/core/` reach into the old `src/infra/` tree.
- `packages/core` builds with the new infra exports.
