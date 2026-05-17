---
status: completed
title: Build packages/cli skeleton with commander, first-run flow, and gw config
type: backend
complexity: medium
dependencies:
    - task_07
---

# Task 12: Build packages/cli skeleton with commander, first-run flow, and gw config

## Overview
Create the `@denisvieiradev/gitwise` CLI package (binary `gw`) with the commander program shell, the first-run provider-selection flow, and the `gw config <key> <value>` subcommand. Command wrappers for `commit`/`review`/`pr`/`release` land in [[task_13]]; this task owns everything else the CLI needs to boot.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- A new package MUST be created at `packages/cli/` with `package.json` (name `@denisvieiradev/gitwise`, `bin: { gw: "./dist/index.js" }`, `type: "module"`, `engines.node >=18`, explicit `files`, and a workspace dependency on `@denisvieiradev/gitwise-core`).
- `packages/cli/src/index.ts` MUST be the entry point; `packages/cli/src/program.ts` MUST define the commander program; `packages/cli/src/first-run.ts` MUST implement the first-run wizard.
- The first-run flow MUST run when `~/.gitwise/config.json` is absent, MUST detect the `claude` binary, MUST offer it as the default if detected, MUST otherwise prompt for an Anthropic API key via `@clack/prompts.password`, MUST write `~/.gitwise/config.json` and (if applicable) `~/.gitwise/.env` with `0600` permissions via [[task_07]]'s helpers, and MUST then continue with the original invocation.
- The `gw config <key> <value>` subcommand MUST accept dotted keys (e.g., `provider`, `models.balanced`, `language`) and persist updates via `writeUserConfig`. Reading via `gw config <key>` (no value) MUST print the current value.
- The CLI MUST accept a global `--api-key` flag that bypasses the interactive password prompt on first run.
- The CLI MUST respect `NO_COLOR` and `--no-color`.
- The CLI MUST register placeholder no-op subcommands for `commit`, `review`, `pr`, and `release` (filled in by [[task_13]]) so the program builds and `gw --help` lists them.
- `packages/cli/__tests__/` MUST contain unit tests for the program registration, the first-run flow against a `mkdtemp` home directory, and the config subcommand round-trip.
</requirements>

## Subtasks
- [ ] 12.1 Scaffold `packages/cli/` with `package.json`, `tsconfig.json`, `tsup.config.ts`, `src/`, and `__tests__/`.
- [ ] 12.2 Implement `packages/cli/src/program.ts` with commander, global flags (`--no-color`, `--api-key`, `--version`), and placeholder subcommand registrations.
- [ ] 12.3 Implement `packages/cli/src/first-run.ts` with the prompt flow and config persistence.
- [ ] 12.4 Implement `packages/cli/src/commands/config.ts` for `gw config <key> [value]`.
- [ ] 12.5 Implement `packages/cli/src/index.ts` as the binary entry that routes to first-run when needed and dispatches the program.
- [ ] 12.6 Add unit + integration tests for the program shell, first-run, and `gw config`.

## Implementation Details
Reference TechSpec "Implementation Design → API Endpoints" for the CLI flag surface and "Component Overview" for the package layout. Reference [ADR-004](adrs/adr-004.md) for the exact first-run sequence.

### Relevant Files
- `packages/cli/package.json` — new.
- `packages/cli/src/index.ts` — new (binary entry).
- `packages/cli/src/program.ts` — new (commander program).
- `packages/cli/src/first-run.ts` — new (provider prompt + persistence).
- `packages/cli/src/commands/config.ts` — new (`gw config`).
- `packages/cli/__tests__/` — new.

### Dependent Files
- `packages/core` exports `getMergedConfig`, `writeUserConfig`, `writeApiKey`, and provider detection helpers — consumed here.
- `packages/cli/src/commands/{commit,review,pr,release}.ts` (created in [[task_13]]) — will be wired into `program.ts`.
- `scripts/release.mjs` (created in [[task_15]]) — relies on `packages/cli/package.json` shape for version propagation.

### Related ADRs
- [ADR-004: Explicit first-run provider choice with persisted user config](adrs/adr-004.md) — exact first-run sequence.
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](adrs/adr-002.md) — package layout and naming.

## Deliverables
- `packages/cli/` package skeleton with bin entry, commander program, first-run flow, and `gw config` subcommand.
- Unit + integration tests **(REQUIRED)**.
- Test coverage 80%+ on the new package **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `program.ts` registers four placeholder command names plus `config`.
  - [ ] `gw --version` prints the package version.
  - [ ] `gw config provider api` writes the new value via `writeUserConfig`.
  - [ ] `gw config provider` (no value) prints the current value.
  - [ ] `gw config models.balanced claude-sonnet-4-6` updates the nested field.
  - [ ] `gw config bogus value` exits non-zero with a descriptive error when the key is unknown.
  - [ ] The `--no-color` flag disables ANSI codes in subsequent output (chalk-level mock).
- Integration tests:
  - [ ] First-run flow: starting with an empty `mkdtemp` home and `claude` mocked as present, running `gw commit` (the placeholder) prompts once and writes a valid `~/.gitwise/config.json` with `provider: "claude-code"`.
  - [ ] First-run flow: with `claude` absent and `--api-key sk-...` supplied, the flow writes `~/.gitwise/.env` with mode `0600` and `provider: "api"`, then proceeds without an interactive prompt.
  - [ ] After first run, a subsequent invocation does NOT re-prompt.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `gw --help` shows the four placeholder commands plus `config`.
- The first-run flow is deterministic across the documented input matrix.
- `gw config` round-trips read/write.
