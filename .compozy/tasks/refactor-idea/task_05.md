---
status: completed
title: Port LLM providers and add MockLLMProvider under core/testing
type: refactor
complexity: medium
dependencies:
    - task_03
---

# Task 5: Port LLM providers and add MockLLMProvider under core/testing

## Overview
Move the Anthropic SDK provider, the Claude Code subprocess provider, the provider factory, and the model-tier router from `src/providers/` into `packages/core/src/providers/`. Add a `MockLLMProvider` under `packages/core/src/testing/` exported via the package's `./testing` subpath so every command test in subsequent tasks can avoid real LLM calls.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- `src/providers/anthropic.ts` (or current `claude.ts`), `src/providers/claude-code.ts`, `src/providers/factory.ts`, `src/providers/model-router.ts`, and `src/providers/types.ts` MUST be ported to `packages/core/src/providers/`.
- The provider interface MUST match the TechSpec "Core Interfaces" `LLMProvider` shape: `chat({ systemPrompt, userMessage, tier }) => { content, tokens: { input, output } }`.
- The factory MUST select between `kind: "api"` and `kind: "claude-code"` based on a `ProviderConfig` argument; it MUST NOT read user config directly (config loading lives in [[task_07]]).
- The Anthropic provider MUST retain 3-retry exponential backoff on HTTP 429/529 errors and throw a typed `PROVIDER_UNAVAILABLE` error on persistent failure.
- The Claude Code provider MUST retain the multi-strategy binary resolver (PATH → Homebrew → nvm → user-supplied path) and surface `claudeCliPath` from config.
- The model-tier router MUST map the four commands to tiers: `commit`/`pr`/`release` default to `fast`, `review` defaults to `powerful`, with `balanced` reserved for overrides. Tier→model identifiers MUST be read from the provided config (TechSpec Data Models `UserConfig.models`).
- A `MockLLMProvider` class implementing `LLMProvider` MUST be added under `packages/core/src/testing/mock-llm-provider.ts` and re-exported from `packages/core/src/testing/index.ts`. It MUST support scripting responses by call index and by prompt prefix match, and MUST count and assert tokens.
- The `MockLLMProvider` MUST be exposed through the package's `./testing` export subpath defined in [[task_03]].
- Existing provider unit tests MUST be relocated to `packages/core/__tests__/unit/providers/` and updated.
- After the move, `src/providers/` MUST be deleted.
</requirements>

## Subtasks
- [ ] 5.1 Port provider files into `packages/core/src/providers/` and update imports.
- [ ] 5.2 Implement (or confirm) the `LLMProvider` and `ProviderConfig` types in `packages/core/src/providers/types.ts` to exactly match TechSpec "Core Interfaces".
- [ ] 5.3 Verify retry/backoff and binary-resolver behaviors carry over unchanged; add tests if any gaps exist.
- [ ] 5.4 Shrink the model-router map to the four supported commands and remove pipeline-era entries.
- [ ] 5.5 Implement `MockLLMProvider` under `packages/core/src/testing/` and export via the `./testing` subpath.
- [ ] 5.6 Relocate provider tests and add new unit tests for `MockLLMProvider`.
- [ ] 5.7 Delete the legacy `src/providers/` directory.

## Implementation Details
See TechSpec "Implementation Design → Core Interfaces" for the exact `LLMProvider`, `ProviderConfig`, and `createProvider()` signatures this task must realize. See "Integration Points" for the retry/backoff and binary-resolver requirements.

### Relevant Files
- `src/providers/claude.ts` — port (rename to `anthropic.ts` to match TechSpec naming if not already).
- `src/providers/claude-code.ts` — port.
- `src/providers/factory.ts` — port; remove dependency on any deleted config types.
- `src/providers/model-router.ts` — port and trim to four commands.
- `src/providers/types.ts` — port and align with TechSpec interfaces.
- `__tests__/unit/providers/claude.test.ts`, `claude-helpers.test.ts`, `model-router.test.ts` — relocate.

### Dependent Files
- `packages/core/src/index.ts` — re-exports the provider types and `createProvider` (the runtime factory may stay internal but types must be public).
- `packages/core/src/testing/index.ts` — re-exports `MockLLMProvider` for the `./testing` subpath.
- All command implementations in [[task_08]]–[[task_11]] will import these providers.

### Related ADRs
- [ADR-004: Explicit first-run provider choice with persisted user config](adrs/adr-004.md) — defines the provider kinds and resolver order that this task must preserve.
- [ADR-003: Non-interactive core with four high-level command functions](adrs/adr-003.md) — informs the `LLMProvider` shape consumed by core commands.

## Deliverables
- Providers ported into `packages/core/src/providers/`.
- `MockLLMProvider` implemented and exported via `./testing`.
- Provider tests relocated and updated.
- Legacy `src/providers/` removed.
- Unit tests with 80%+ coverage on providers and the mock **(REQUIRED)**.
- Integration test that wires the factory to `MockLLMProvider` via `kind: "api"` injection (bypassing the SDK call) **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `createProvider({ kind: "api", models })` returns an instance whose `chat()` calls the Anthropic SDK with the model selected by tier.
  - [ ] `createProvider({ kind: "claude-code", claudeCliPath, models })` returns an instance whose `chat()` spawns the `claude` binary at the resolved path.
  - [ ] Anthropic provider retries up to three times on 429 then throws `PROVIDER_UNAVAILABLE`.
  - [ ] Anthropic provider retries up to three times on 529 then throws `PROVIDER_UNAVAILABLE`.
  - [ ] Claude Code provider resolves the binary from PATH, then Homebrew, then nvm, then the configured `claudeCliPath`, and throws `PROVIDER_UNAVAILABLE` if none resolve.
  - [ ] Model-router exposes exactly the four command keys and maps each to the documented default tier.
  - [ ] `MockLLMProvider` returns scripted responses keyed by call index.
  - [ ] `MockLLMProvider` returns scripted responses keyed by prompt-prefix match when configured that way.
  - [ ] `MockLLMProvider` records token totals and exposes them via an `assertTokens()` helper.
- Integration tests:
  - [ ] A consumer importing `@denisvieiradev/gitwise-core/testing` receives the `MockLLMProvider` class and can pass it into a fake command path that uses it for one `chat()` call.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Providers and `MockLLMProvider` are importable from `@denisvieiradev/gitwise-core` and `@denisvieiradev/gitwise-core/testing` respectively.
- No references to the legacy `src/providers/` remain.
