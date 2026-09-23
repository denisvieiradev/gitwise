# Codex/Kiro/Copilot Support Context

**Gathered:** 2026-09-22
**Spec:** `.specs/features/codex-kiro-copilot-support/spec.md`
**Status:** Ready for design

---

## Feature Boundary

`gitwise` currently supports Claude as an LLM provider (`claude-code` CLI subprocess or the Anthropic API) and ships one real native-agent surface: a full Claude Code plugin (`packages/skills`), distributed via Claude Code's plugin marketplace. It also carries `.gemini/skills/*` files that were meant to be a second native surface for Gemini CLI but, on inspection, never actually reached end users (see Implementation Decisions) — those are removed as part of this feature, not extended. This feature adds Claude-equivalent support for three more AI coding tools — **OpenAI Codex CLI**, **GitHub Copilot CLI**, and **Kiro** — on both dimensions (LLM provider backend + native agent surface, the latter via a new, real install command), and makes switching between all providers easy from the CLI. It does not touch the four product commands' behavior (commit/review/pr/release logic is unchanged) or the Claude integration already shipped.

---

## Implementation Decisions

### Scope: provider backend + native skills, both required

- Each of Codex, Copilot, and Kiro becomes a selectable `gw` provider (`ProviderConfig.kind` gains `"codex" | "copilot" | "kiro"`), following the existing `ClaudeCodeProvider` subprocess pattern: resolve the tool's CLI binary, spawn it non-interactively, parse its output into `LLMChatResponse`.
- Each tool also gets a native agent-invocable surface for gitwise's four commands, matching the real reach the Claude Code plugin already has (installable by any end user, not just gitwise contributors) — but the delivery mechanism and file shape differ by tool because their extensibility models differ (see Specific References below): Codex and Kiro get real `SKILL.md` bundles, installed into the user's project via `gw skills install <tool>`; Copilot gets an ambient instructions file installed the same way, because Copilot CLI has no invocable-skill mechanism at all.
- These two dimensions are independent: a user can use `gw commit` with Kiro as the backend while Claude Code drives the interactive skill session, or any other combination. Nothing forces the LLM-provider choice and the "which tool are you typing into" choice to match.

### Degraded capability handling: graceful degradation, not a blocker

- None of Codex, Copilot, or Kiro CLIs expose a system-prompt flag the way `claude -p --system-prompt` does. All three providers fold `LLMChatRequest.systemPrompt` and `userMessage` into a single combined prompt string before invoking the tool.
- None of Copilot or Kiro report token usage in headless/non-interactive mode (Codex's `--json` JSONL stream has not been confirmed to include usage either — this must be verified against actual `codex exec --json` output during implementation, not assumed). Where a provider's output contains no usage figures, `LLMChatResponse.tokens` reports `{ input: 0, output: 0 }` and the CLI's post-call print step shows `tokens: n/a` instead of a number for that call, rather than fabricating counts.
- A provider missing these capabilities is still fully supported — it is never a reason to exclude a provider from the `kind` enum or to refuse to wire it into `createProvider()`.

### Provider switching UX: config validation + interactive picker

- `gw config provider <value>` validates against the full provider enum (`api`, `claude-code`, `codex`, `copilot`, `kiro`) and rejects unknown values with an error listing the valid choices (today it accepts any string).
- A new `gw provider` command reuses the first-run wizard's detection logic (`resolveClaudeBinary`-style resolvers, one per tool) to list installed/detected CLIs plus the API-key fallback, and lets the user pick one interactively via `@clack/prompts` — the same library already used in `first-run.ts`. Selecting a provider writes `~/.gitwise/config.json` the same way `runFirstRun` does today.
- The first-run wizard (`runFirstRun`) is extended to detect all five providers, not just Claude Code, presenting them in detection order with the API-key path remaining the universal fallback.

### Model configuration: per-provider blocks, not one shared block

- `UserConfig.models` moves from one flat `{fast, balanced, powerful}` block (today defaulted to Claude model IDs and reused verbatim by whichever provider is active) to a map keyed by provider (`models["claude-code"]`, `models["codex"]`, etc.), each with its own tier defaults in that vendor's own model namespace.
- This was a gap in the first spec draft, caught by the user asking whether *all* configuration would be equal to Claude Code's today — it would not have been, since switching to Codex/Copilot/Kiro while the flat block still held Claude model strings would break the very first call.
- Existing users' flat `models` block is migrated transparently on next read: seeded into `models[<their configured provider>]`, other four provider keys backfilled with defaults. `<repo>/.gitwise.json` model overrides continue to apply only to the currently active provider, not to every provider's block.

### Priority: all three providers are P1 (MVP), equal footing

- Codex, Copilot, and Kiro provider support and native-skill support all ship together as MVP. There is no sequencing between them — the same subprocess-provider pattern and the same skill/instructions-bundle pattern apply to all three, so splitting them into different priority tiers would not reduce risk, only defer otherwise-identical work.
- Kiro cannot be exercised end-to-end interactively during this work (no paid AWS subscription available), so its provider and skill support are built and unit-tested against Kiro's documented CLI contract (mocked subprocess I/O), the same way the existing test suite already mocks Claude Code's `spawn` calls. This is a testing-approach note, not a scope reduction — see spec.md Assumptions.

### Agent's Discretion

- Exact config key names for new provider binary paths (e.g. `codexCliPath`, `copilotCliPath`, `kiroCliPath`) — follow the existing `claudeCliPath` naming convention.
- Exact wording/structure of the Copilot ambient instructions file and where in `.github/` it lives (a new modular `*.instructions.md` file vs. a section appended to `copilot-instructions.md`) — resolved during Design, must not silently overwrite a user's existing `.github/copilot-instructions.md` content.
- Exact copy target within a user's project for `gw skills install codex` (`.agents/skills/gitwise-<command>/`, per Codex's own documented convention) — resolved during Design; no `.codex/skills/` mirror is needed since Codex doesn't read one.

### Native-surface distribution: real install, not repo-root files — and Gemini's dead config is removed

- Checking how the existing `.gemini/skills/gitwise-*` precedent actually reaches users revealed it doesn't: those files sit only at gitwise's own repo root, are never published in any npm package (`packages/skills/package.json`'s `files` list doesn't include `.gemini`), and nothing installs or updates them into a user's own project. It's dead weight that only ever helped someone hacking on gitwise's own source — and it's undocumented anywhere (README/docs never mention Gemini).
- Decision: `.gemini/settings.json` and `.gemini/skills/*` are removed from the repo (they're tracked files, so this is a real `git rm`, not just an untracked cleanup).
- Decision: the Codex/Kiro/Copilot native surfaces this feature builds must not repeat that mistake. Real distribution: a new `gw skills install <tool>` CLI command copies the correct adapter files into the *user's own project* (wherever they run it), sourced from generated templates bundled inside the npm-published `@denisvieiradev/gitwise-skills` package. `packages/cli` gains a new dependency on `@denisvieiradev/gitwise-skills` to read those bundled templates at runtime.
- Update mechanism: re-running `gw skills install <tool>` after upgrading `gw` overwrites the gitwise-managed files with the current version's content (idempotent), without touching anything else in `.agents/skills/`, `.kiro/skills/`, or `.github/instructions/` that isn't gitwise's own (only `gitwise-*`-named entries / the specific `gitwise.instructions.md` file are ever touched). No separate version-diffing UI for MVP — consistent with gitwise's "no persistent state, re-run to refresh" philosophy already used elsewhere (e.g. `gw release prepare`/`finish`).

### Update mechanisms across surfaces — a documentation gap, confirmed by research

The user asked whether documentation explains how gitwise itself gets updated across these different providers/surfaces. Investigation found:

- **`gw` CLI (npm)**: no update instructions exist anywhere in README or `docs/` today — not new to this feature, but now in scope to document since we're adding new install surfaces.
- **Claude Code plugin**: Claude Code can auto-update installed plugins in the background, or a user can force it via `/plugin marketplace update <name>` + reloading — this is existing Claude Code behavior, not something gitwise builds; it only needs a documentation mention.
- **Codex/Kiro/Copilot (new `gw skills install`)**: no precedent existed (Gemini never had an update path either) — this feature must design one. Resolved above: re-running the install command is the update mechanism.

### Declined / Undiscussed Gray Areas → Assumptions

- **Auth flow specifics per tool** (Codex's `CODEX_API_KEY` vs. `codex login`; Copilot's `COPILOT_GITHUB_TOKEN` vs. `gh auth`; Kiro's `KIRO_API_KEY` + paid-tier gate) were not separately discussed with the user. Assumption: gitwise does not manage these tools' own authentication — it only detects whether the CLI binary is present and callable (mirroring how `ClaudeCodeProvider` never handles Claude Code's own login state), and surfaces the underlying tool's auth error verbatim if a call fails for auth reasons. Rationale: gitwise is not in the business of re-implementing each vendor's auth; consistent with the existing Claude Code provider's behavior.
- **Exact JSON/event-stream parsing details for Codex's `--json` output** were not discussed (the user gave scope/priority direction, not wire-format detail). Assumption: implementation-time research against the live `codex exec --json` output, following the same Knowledge Verification Chain used for this spec, resolves the exact parsing; the spec only commits to the observable contract (final text extracted, usage shown as available-or-n/a).

---

## Specific References

- Existing pattern to mirror for provider backends: `packages/core/src/providers/claude-code.ts` (binary resolution via common install paths + PATH + nvm fallback, `spawn`-based non-interactive call, JSON response parsing, `GitwiseError` wrapping on ENOENT).
- Existing pattern to mirror for provider selection: `packages/cli/src/first-run.ts` (`needsFirstRun`, `runFirstRun`) and `packages/cli/src/commands/config.ts` (`gw config <key> <value>`).
- `.gemini/skills/gitwise-*/SKILL.md` (being removed by this feature) demonstrated the adaptation *technique* worth keeping — rewriting the Claude-specific `${CLAUDE_PLUGIN_ROOT}` script path to a workspace-relative path, and rewriting the frontmatter `description` for the target tool's discovery convention — even though the file's delivery mechanism (committed at gitwise's own repo root, never installed anywhere) was the part that didn't work and isn't being repeated.
- Codex and Kiro both implement Anthropic's open Agent Skills standard (`SKILL.md` with `name`/`description` frontmatter): Codex reads `.agents/skills/` (repo, walking up to root) then `~/.agents/skills/`; Kiro reads `.kiro/skills/[name]/SKILL.md` (workspace) then `~/.kiro/skills/[name]/SKILL.md` (global). Neither documents a `${CLAUDE_PLUGIN_ROOT}`-equivalent env var for locating bundled scripts — script paths must be workspace-relative, matching the technique already used for the Gemini skills.
- Copilot CLI has no skill/plugin mechanism at all — only ambient, always-loaded instruction files (`.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` with `applyTo` scoping, or `AGENTS.md`). Its native surface is necessarily an instructions file that describes all four commands, not a per-command invocable skill.

---

## Deferred Ideas

- **Copilot real token usage via `--usage-output-file`**: Copilot CLI (1.0.88) can write "final usage statistics as JSON" to a file via `--usage-output-file`. Researched in G5 and left out: the file format is not documented on docs.github.com, and the single allowed live run failed before any model call (`Model "gpt-5-mini" from --model flag is not available.`). That run still wrote the file, showing the top-level shape (`totalPremiumRequestCost`, `totalUserRequests`, `totalNanoAiu`, `totalApiDurationMs`, `sessionStartTime`, `codeChanges`, `modelMetrics` (empty), `agentMetrics`, `lastCallInputTokens`, `lastCallOutputTokens`), but not the per-model token fields or whether `lastCall*` covers a whole multi-call agent turn. Copilot keeps reporting `tokensAvailable: false` (spec-compliant). Next step: one successful run with an available model (e.g. `claude-haiku-4.5`) to observe a populated `modelMetrics`.
