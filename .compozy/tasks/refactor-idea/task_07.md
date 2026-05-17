---
status: completed
title: Port and refit user/repo config loaders with env-file key handling
type: refactor
complexity: medium
dependencies:
    - task_02
    - task_04
---

# Task 7: Port and refit user/repo config loaders with env-file key handling

## Overview
Migrate the configuration loaders into `packages/core/src/config/`, replace the devflow `Config` shape with the new `UserConfig` and `RepoConfig` schemas, and route API keys through `~/.gitwise/.env` with `0600` permissions instead of `config.json`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- The legacy `src/core/config.ts` MUST be ported and split into `packages/core/src/config/user.ts`, `repo.ts`, and `merge.ts` matching TechSpec "Component Overview".
- `UserConfig` MUST have the exact shape documented in TechSpec "Data Models" (`provider`, optional `claudeCliPath`, `models.{fast,balanced,powerful}`, `language`, optional `defaultBaseBranch`, `commitConvention`).
- `RepoConfig` MUST be partial and deep-merged on top of `UserConfig`, supporting `models`, `language`, `defaultBaseBranch`, `commitConvention`, and `templatesPath`.
- `UserConfig` MUST be loaded from `~/.gitwise/config.json`; `RepoConfig` MUST be loaded from `<cwd>/.gitwise.json` (note the dotfile name; the templates path is `<cwd>/.gitwise/templates/`).
- API keys MUST be read from `process.env.ANTHROPIC_API_KEY` first, then from `~/.gitwise/.env` (single line `ANTHROPIC_API_KEY=...`). Keys MUST NEVER be written to `config.json`.
- A `writeUserConfig(partial)` helper MUST persist updates atomically and a `writeApiKey(value)` helper MUST write `~/.gitwise/.env` with file mode `0600`.
- Defaults MUST be defined inline: model identifiers come from the project CLAUDE.md / TechSpec ("claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"); language defaults to `en`; commit convention defaults to `conventional`.
- Existing tests under `__tests__/unit/core/config.test.ts` MUST be relocated and updated for the new schema.
- All references to the deleted feature-state fields MUST be removed.
- The legacy `src/core/config.ts` MUST be deleted at the end.
</requirements>

## Subtasks
- [ ] 7.1 Port and split the loader into `user.ts`, `repo.ts`, and `merge.ts` under `packages/core/src/config/`.
- [ ] 7.2 Define `UserConfig` and `RepoConfig` TypeScript interfaces matching TechSpec Data Models.
- [ ] 7.3 Implement default `UserConfig`, deep-merge with `RepoConfig`, and validation of the merged result.
- [ ] 7.4 Implement `~/.gitwise/.env` reading and `writeApiKey` with mode `0600`.
- [ ] 7.5 Implement `writeUserConfig(partial)` and a `getMergedConfig({ cwd })` entry point exported from `packages/core`.
- [ ] 7.6 Relocate and expand tests under `packages/core/__tests__/unit/config/`.
- [ ] 7.7 Delete legacy `src/core/config.ts`.

## Implementation Details
Reference TechSpec "Implementation Design → Data Models" for the exact shapes. Note: API-key handling is intentionally separate from `config.json` ([ADR-004](adrs/adr-004.md)).

### Relevant Files
- `src/core/config.ts` — port and split.
- `src/core/types.ts` — prune any feature-state types and add the new `UserConfig`/`RepoConfig` types if not already defined.
- `__tests__/unit/core/config.test.ts` — relocate and expand.
- `packages/core/src/infra/filesystem.ts` (from [[task_04]]) — consumed for atomic writes.
- `packages/core/src/infra/env.ts` (from [[task_04]]) — consumed for env-file reads.

### Dependent Files
- `packages/core/src/index.ts` — re-exports `getMergedConfig`, `writeUserConfig`, `writeApiKey`, and the `UserConfig`/`RepoConfig` types.
- All four command implementations ([[task_08]]–[[task_11]]) consume the merged config.
- The CLI first-run flow ([[task_12]]) calls `writeUserConfig` and `writeApiKey`.

### Related ADRs
- [ADR-004: Explicit first-run provider choice with persisted user config](adrs/adr-004.md) — defines this task's data model and the key-storage decision.
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — establishes that config loading lives in core.

## Deliverables
- Config loaders ported and split.
- `UserConfig`/`RepoConfig` schemas implemented.
- Env-file API-key handling implemented with `0600` permissions.
- Legacy `src/core/config.ts` removed.
- Unit tests with 80%+ coverage on the loaders and merge logic **(REQUIRED)**.
- Integration test that round-trips a write/read against a `mkdtemp` home directory **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `getMergedConfig({ cwd })` returns the defaults when neither user nor repo config exists.
  - [ ] User config alone overrides the defaults.
  - [ ] Repo config alone overrides the defaults (deep-merged into nested fields like `models`).
  - [ ] Repo config takes precedence over user config in all fields.
  - [ ] `writeUserConfig({ provider: "api" })` persists atomically and round-trips through `getMergedConfig`.
  - [ ] `writeApiKey("sk-...")` writes the file with mode `0600` (skip the perms assertion on Windows; document the skip).
  - [ ] `getMergedConfig` does NOT include the API key in its returned object.
  - [ ] Reading the API key prefers `process.env.ANTHROPIC_API_KEY` over the `~/.gitwise/.env` file.
  - [ ] An invalid `RepoConfig` JSON throws a typed `INVALID_REPO_CONFIG` error with a usable message.
- Integration tests:
  - [ ] Round-trip: write user config to a fake home, write repo config to a fake cwd, read with `getMergedConfig`, and assert the merged shape.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Config loaders honor the precedence rules and key-storage requirements.
- The legacy config module is gone.
