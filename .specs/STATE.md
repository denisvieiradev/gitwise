# STATE

## Decisions

### AD-001
- **Decision**: LLM providers that wrap a non-interactive CLI subprocess (Claude Code, Codex, Copilot, Kiro) share one `CliSubprocessProvider` base for spawn/timeout/stderr-capture/ENOENT-wrapping logic; each tool supplies only binary resolution, arg-building, and output-parsing as a small spec object/adapter.
- **Reason**: Four CLI-subprocess providers duplicating ClaudeCodeProvider's ~230 lines each would mean the same subprocess bugs get fixed (or missed) independently four times; a shared base keeps that logic in one place.
- **Trade-off**: Refactoring the existing, production `ClaudeCodeProvider` onto the new base carries real regression risk given its current test suite is thin (2 tests / 61 lines) — mitigated by adding characterization tests for all its branches before the extraction, not after.
- **Scope**: `packages/core/src/providers/*` — any future CLI-subprocess-based LLM provider must extend this base, not hand-roll its own spawn logic.
- **Date**: 2026-09-22
- **Status**: active

### AD-002
- **Decision**: When a provider cannot report token usage (or hasn't been confirmed to), gitwise represents that as an explicit `tokensAvailable: boolean` field threaded through `LLMChatResponse` and every command's typed result (`CommitPlan`, `ReviewResult`, `PrDraft`, `ReleasePlan`) and the persisted `.gitwise/release-plan.json` schema — never a magic sentinel value (e.g. `-1` or reusing `0`).
- **Reason**: `0/0` would misleadingly imply a free call; a real, typed boolean is the only way to distinguish "genuinely zero usage" from "this provider doesn't report usage" without guessing from the numbers.
- **Trade-off**: Wider blast radius than a single provider file — touches provider types, all four command modules, five CLI print sites, and the release-plan persistence/validation layer. Accepted because the alternative (a sentinel) is a worse, more fragile long-term shape.
- **Scope**: `packages/core/src/providers/types.ts`, `packages/core/src/commands/*`, `packages/cli/src/commands/*`, `packages/core/src/commands/release-plan.ts` (schema + validator, with a missing field defaulting to `true` for backward compatibility with plans persisted before this change).
- **Date**: 2026-09-22
- **Status**: active

### AD-003
- **Decision**: Native agent-tool surfaces for gitwise's four commands (beyond the CLI itself and the Claude Code plugin's own marketplace distribution) are produced by a generator that reads the canonical `packages/skills/skills/*/SKILL.md` + built scripts, emits tool-specific variants into `packages/skills/dist/adapters/<tool>/`, and are installed into a *user's own project* on demand via a new `gw skills install <tool>` CLI command — not hand-written per tool, and not merely committed at gitwise's own repo root.
- **Reason**: Investigating the existing `.gemini/skills/*` precedent during this feature showed it never reached real end users at all — those files lived only at gitwise's own repo root, were never published in any npm package's `files`, and no install/update path ever copied them into a user's project. It only helped someone hacking on gitwise's own source. `.gemini/*` is being removed as dead weight rather than extended.
- **Trade-off**: New build-time (generator) and runtime (install command, new `gitwise-skills` dependency on the CLI package) infrastructure instead of the simpler-to-write-once repo-root hand copy. Re-running `gw skills install <tool>` is also how a user updates their copy after upgrading `gw` — there is no separate diffing/versioning UI for MVP, matching gitwise's existing "no persistent state, re-run to refresh" philosophy.
- **Scope**: Any future "add native support for tool X" feature (without its own plugin marketplace) should extend the generator's tool-adapter list and rely on `gw skills install`, never commit tool-specific files at the gitwise repo root as the delivery mechanism.
- **Date**: 2026-09-22
- **Status**: active

## Handoff

_No paused session yet — feature is in Design phase._
