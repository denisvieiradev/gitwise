# Codex/Kiro/Copilot Support Specification

## Problem Statement

`gitwise` only speaks to Claude (Claude Code CLI or the Anthropic API) as an LLM backend, and only Claude Code plugin users get a native, in-tool way to run its four commands (a parallel `.gemini/*` attempt never actually reached end users — see Assumptions). Users standardized on OpenAI Codex, GitHub Copilot, or AWS Kiro get neither: they cannot point `gw` at their existing tool's auth/subscription, and they cannot invoke `commit`/`review`/`pr`/`release` from inside those tools' own agents in their own projects. This closes that gap for all three with a real, installable distribution mechanism, and makes the provider choice a first-class, easily-changed setting rather than a one-time first-run decision.

## Goals

- [ ] `gw commit|review|pr|release` work identically (same output contract, same flags) when the configured provider is Codex, Copilot, or Kiro instead of Claude.
- [ ] Users can discover and switch providers in one command (`gw provider`) without hand-editing config files or memorizing exact string values.
- [ ] Codex, Kiro, and Copilot users can install a real native surface into their *own* project via `gw skills install <tool>` to run gitwise's four commands from inside those tools' own agents — reaching actual end users, unlike the removed `.gemini/*` precedent.
- [ ] A provider that can't report token usage or accept a separate system prompt is still fully usable — it degrades one output line, it does not become second-class or excluded.
- [ ] Every new provider gets the same configuration surface Claude Code has today: its own CLI-path override, its own detected-or-manual selection, and its own remembered model tiers — switching providers is a single `gw provider` action, not a multi-field manual reconfiguration.
- [ ] Documentation (README + docs site) accurately describes, for every supported provider, how diffs flow, how to install/switch to it, and how to update it later.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---|---|
| Managing Codex/Copilot/Kiro's own authentication (login flows, token refresh, subscription upgrades) | Each vendor owns its own auth; gitwise only detects CLI presence and surfaces the tool's own auth errors, exactly like it already does for Claude Code. |
| Changing the behavior/output of `commit`, `review`, `pr`, or `release` themselves | This feature only adds providers and native-agent surfaces; the four commands' logic in `packages/core/src/commands/*` is unchanged. |
| Adding new LLM providers beyond Codex, Copilot, Kiro (e.g. Gemini as a `gw` provider, local models) | Out of this feature's boundary. Gemini's existing `.gemini/*` files are removed (see Retire unused Gemini surface story) because they never functioned as real distribution, not replaced with an equivalent Gemini provider — re-adding Gemini support properly is a separate future feature. |
| A version-diffing/changelog UI for `gw skills install` | Re-running the install command is the update mechanism for MVP (it overwrites gitwise-managed files with the current version's content); telling the user what changed between versions is a future enhancement. |
| A GUI/TUI provider switcher beyond the terminal `@clack/prompts` picker | Matches the existing first-run wizard's UI toolkit; no new UI framework introduced. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Codex/Copilot/Kiro own-auth handling | gitwise never manages vendor auth; it detects the CLI binary and surfaces the vendor's own auth error verbatim on failure | Consistent with existing `ClaudeCodeProvider`; gitwise is not an auth broker | y (declined for discussion, logged per discuss.md) |
| Codex `--json` usage-field availability | Verified against real `codex exec --json` output during implementation; if absent, treated the same as Copilot/Kiro (usage n/a) | Documentation does not confirm a usage field in the JSONL stream; must not be assumed present | y (declined for discussion, logged per discuss.md) |
| Token usage unavailable from a provider | Report `{ input: 0, output: 0 }` internally; CLI prints `tokens: n/a` for that call instead of `0 / 0` | `0/0` would misleadingly imply a free call; the graceful-degradation decision (see context.md) requires visibly showing "not available" rather than a fabricated or misleading number | y |
| System prompt with no dedicated flag | Provider concatenates `systemPrompt` + `userMessage` into one combined prompt before invoking the CLI | Only workable option given none of the three CLIs expose a system-prompt flag | y |
| Copilot native surface shape | An instructions file (`.github/instructions/gitwise.instructions.md`), not a per-command skill | Copilot CLI has no invocable-skill mechanism at all — only always-loaded instruction files (see context.md Specific References) | y |
| Existing user `.github/copilot-instructions.md` content | Never overwritten; gitwise's instructions ship as a separate modular file under `.github/instructions/`, which Copilot CLI loads alongside repo-wide instructions | A destructive overwrite of user content is unacceptable; Copilot's own modular-instructions mechanism (`applyTo`-scoped `*.instructions.md`) exists precisely to avoid this collision | y |
| Codex skill directory location | `.agents/skills/` (OpenAI's own documented convention), not a gitwise-invented `.codex/skills/` | Codex does not read a tool-specific directory; using its actual discovery path is required for the skill to load at all | y |
| Kiro skill directory location | `.kiro/skills/[name]/SKILL.md`, mirroring the existing `.claude/skills/`, `.cursor/skills/` convention already present in this workspace | Documented Kiro convention; consistent with the Agent Skills standard both Codex and Kiro implement | y |
| Kiro end-to-end interactive verification | Built and unit-tested against Kiro's documented CLI contract with mocked subprocess I/O; not manually verified against a live paid Kiro session | No paid AWS Kiro subscription available during this work (see context.md Priority decision) | y |
| `models` config shape | Becomes a per-provider map (`models[<provider>] = {fast, balanced, powerful}`) instead of one shared flat block, with a transparent one-time migration of any existing flat config | A single shared block of literal model-ID strings defaults to Claude's model names and breaks the moment a non-Claude provider is active (e.g. `codex exec --model claude-haiku-4-5-20251001`); switching providers must not require the user to manually fix model strings | y |
| `<repo>/.gitwise.json` `models` override scope | Applies only to the currently active provider's tier values, not to every provider's block | A single repo is normally driven by one active provider at a time; scoping the override to "all providers" would silently reach into providers that repo isn't even using | y |
| `.gemini/*` disposition | Removed outright (`git rm .gemini/settings.json .gemini/skills`), not migrated or extended | Investigation showed these tracked files never reached end users — never published in any npm package, never installed anywhere, undocumented — so they are dead weight, not a working feature to preserve | y |
| Codex/Kiro/Copilot native-surface delivery mechanism | A new `gw skills install <tool>` command copies generated adapter files (bundled inside the published `@denisvieiradev/gitwise-skills` package) into the user's own project | The `.gemini/*` precedent this was originally going to mirror turned out not to reach users at all (files committed at gitwise's own repo root only); real distribution requires an install step, matching the reach Claude's plugin marketplace already has | y |
| Update mechanism for `gw skills install`-managed files | Re-running `gw skills install <tool>` after upgrading `gw` overwrites gitwise-managed files with the current version's content; no separate diffing/versioning UI | Matches gitwise's existing "no persistent state, re-run to refresh" philosophy (e.g. `gw release prepare`/`finish`); no precedent existed to mirror since Gemini's files were never updated either | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Codex as an LLM provider ⭐ MVP

**User Story**: As a `gw` user with OpenAI Codex CLI installed, I want to select Codex as my LLM provider so that `gw commit|review|pr|release` use my existing Codex auth instead of requiring a separate Anthropic API key or Claude Code install.

**Why P1**: Core value of this feature — using Codex as the actual AI backend for gitwise's commands.

**Acceptance Criteria**:

1. WHEN `provider` is set to `"codex"` and a `gw` command runs THEN the system SHALL invoke the Codex CLI non-interactively (`codex exec`) with the combined system+user prompt and the configured model for the requested tier, and return the final response text as `LLMChatResponse.content`.
2. WHEN the Codex CLI reports token usage in its output THEN the system SHALL populate `LLMChatResponse.tokens` with those exact input/output counts.
3. IF the Codex CLI's output contains no token-usage data THEN the system SHALL set `LLMChatResponse.tokens` to `{ input: 0, output: 0 }` and the CLI's token-count print step SHALL show `tokens: n/a` for that call instead of `0 / 0`.
4. IF the Codex binary cannot be found at the configured or auto-detected path THEN the system SHALL raise a `GitwiseError` with code `PROVIDER_UNAVAILABLE` naming the tool and instructing the user to re-run `gw provider`.
5. IF the Codex CLI process exits non-zero THEN the system SHALL surface the CLI's own stderr/error message in the thrown error, without modification or suppression.
6. The system SHALL resolve the Codex binary path using the same precedence as `resolveClaudeBinary` (explicit config path → common install paths → `PATH` lookup → nvm fallback), exposed as a `codexCliPath` config key.

**Independent Test**: With Codex CLI installed and authenticated, set `provider: "codex"` in `~/.gitwise/config.json` and run `gw review`; the review output is produced without any Anthropic API key configured.

---

### P1: Copilot as an LLM provider ⭐ MVP

**User Story**: As a `gw` user with GitHub Copilot CLI installed, I want to select Copilot as my LLM provider so that gitwise's commands run against my existing Copilot subscription.

**Why P1**: Same core value as Codex, for the Copilot ecosystem.

**Acceptance Criteria**:

1. WHEN `provider` is set to `"copilot"` and a `gw` command runs THEN the system SHALL invoke the Copilot CLI non-interactively (`copilot -p ... --no-ask-user`) with the combined system+user prompt and the configured model, and return the final response text as `LLMChatResponse.content`.
2. IF the Copilot CLI's output contains no token-usage data THEN the system SHALL set `LLMChatResponse.tokens` to `{ input: 0, output: 0 }` and the CLI's token-count print step SHALL show `tokens: n/a` for that call.
3. IF the Copilot binary cannot be found THEN the system SHALL raise a `GitwiseError` with code `PROVIDER_UNAVAILABLE` naming the tool and instructing the user to re-run `gw provider`.
4. IF the Copilot CLI process exits non-zero THEN the system SHALL surface the CLI's own stderr/error message in the thrown error, without modification or suppression.
5. The system SHALL resolve the Copilot binary path using the same precedence pattern as `resolveClaudeBinary`, exposed as a `copilotCliPath` config key.

**Independent Test**: With Copilot CLI installed and authenticated, set `provider: "copilot"` and run `gw commit`; a Conventional Commits message is generated without any Anthropic API key configured.

---

### P1: Kiro as an LLM provider ⭐ MVP

**User Story**: As a `gw` user with Kiro CLI installed and a qualifying paid subscription, I want to select Kiro as my LLM provider so that gitwise's commands run against my existing Kiro account.

**Why P1**: Same core value as Codex/Copilot, for the Kiro ecosystem; not deferred despite being the hardest to verify live (see context.md Priority decision).

**Acceptance Criteria**:

1. WHEN `provider` is set to `"kiro"` and a `gw` command runs THEN the system SHALL invoke the Kiro CLI non-interactively (`kiro-cli chat --no-interactive`) with the combined system+user prompt, and return the final response text as `LLMChatResponse.content`.
2. IF the Kiro CLI's output contains no token-usage data THEN the system SHALL set `LLMChatResponse.tokens` to `{ input: 0, output: 0 }` and the CLI's token-count print step SHALL show `tokens: n/a` for that call.
3. IF the Kiro binary cannot be found, OR the CLI reports a subscription-tier/auth failure THEN the system SHALL raise a `GitwiseError` with code `PROVIDER_UNAVAILABLE` (binary missing) or surface the CLI's own auth/subscription error verbatim (auth failure) — the two cases are distinguished by whether the binary was invocable at all.
4. The system SHALL resolve the Kiro binary path using the same precedence pattern as `resolveClaudeBinary`, exposed as a `kiroCliPath` config key.

**Independent Test**: With a mocked Kiro CLI subprocess returning a documented-shape response, set `provider: "kiro"` and run `gw review`; the review output is parsed correctly from Kiro's response format. (Live verification against a real paid Kiro account is out of scope for this work per the logged assumption.)

---

### P1: Easy provider switching ⭐ MVP

**User Story**: As a `gw` user, I want a single command that shows me which AI tools are available and lets me pick one, so I don't have to hand-edit config files or memorize provider name strings.

**Why P1**: Directly answers "allow change easily if the user want" — without this, adding three more provider strings only makes switching harder, not easier.

**Acceptance Criteria**:

1. WHEN the user runs `gw provider` THEN the system SHALL detect which of Claude Code, Codex, Copilot, and Kiro CLIs are installed (reusing each provider's binary-resolution logic) and present them in an interactive list alongside the "Anthropic API key" option.
2. WHEN the user selects a provider from the `gw provider` list THEN the system SHALL write that choice to `~/.gitwise/config.json` the same way `runFirstRun` does today, including the resolved CLI path when applicable.
3. WHEN the user runs `gw config provider <value>` with `<value>` in `{api, claude-code, codex, copilot, kiro}` THEN the system SHALL accept and persist it exactly as it does today for `api`/`claude-code`.
4. IF the user runs `gw config provider <value>` with an unrecognized `<value>` THEN the system SHALL reject the write and print an error listing the valid provider values, instead of silently persisting an invalid provider.
5. WHEN `needsFirstRun` triggers the first-run wizard THEN the system SHALL detect and offer all five providers (not just Claude Code), preserving today's behavior of falling back to the Anthropic API key prompt when nothing is detected or nothing is chosen.

**Independent Test**: On a machine with Codex CLI installed but no Claude Code, run `gw provider`; Codex appears as a selectable, detected option and selecting it updates `~/.gitwise/config.json` with `provider: "codex"`.

---

### P1: `gw skills install` — real native-surface distribution ⭐ MVP

**User Story**: As a `gw` user working in my own project, I want a command that installs gitwise's native agent surface for my tool of choice into *my* project, so Codex/Kiro/Copilot can actually run gitwise's commands for me — not just for gitwise's own contributors.

**Why P1**: Investigation during Design found the existing `.gemini/skills/*` precedent never reached end users — those files live only at gitwise's own repo root, are never published in any npm package, and nothing installs or updates them into a user's project. Building Codex/Kiro/Copilot's native surfaces the same way would repeat that mistake. This story is the actual delivery mechanism the other three stories depend on.

**Acceptance Criteria**:

1. WHEN a user runs `gw skills install <tool>` (`<tool>` ∈ `{codex, kiro, copilot}`) inside their own project THEN the system SHALL copy that tool's generated adapter files, bundled inside the published `@denisvieiradev/gitwise-skills` package, into the correct tool-specific location relative to the current working directory.
2. The system SHALL bundle the generated adapter templates (produced by the build-time generator) inside `@denisvieiradev/gitwise-skills`'s published `files`, and `@denisvieiradev/gitwise` (the CLI package) SHALL depend on `@denisvieiradev/gitwise-skills` to read them at install time.
3. WHEN `gw skills install <tool>` is re-run (e.g. after upgrading `gw`) THEN the system SHALL overwrite the previously-installed gitwise-managed files with the currently-bundled version's content — this re-run IS the update mechanism; no separate `gw skills update` command or version-diff UI exists for MVP.
4. The system SHALL only ever create or overwrite gitwise-owned paths (files/directories named `gitwise-*` under `.agents/skills/` or `.kiro/skills/`, and the single `.github/instructions/gitwise.instructions.md` file) — it SHALL NOT modify, remove, or overwrite any other file already present in those directories.
5. IF the target directory (`.agents/skills/`, `.kiro/skills/`, or `.github/instructions/`) does not yet exist in the user's project THEN the system SHALL create it.
6. IF `<tool>` is not one of `{codex, kiro, copilot}` THEN the system SHALL reject the command with an error listing the valid tool names.

**Independent Test**: In an empty scratch git repository (not gitwise's own), run `gw skills install codex`; `.agents/skills/gitwise-commit/SKILL.md` (and the other 3 commands) now exist in that scratch repo, correctly referencing the bundled script paths. Re-running the same command after simulating a `gw` version bump overwrites those files with new content, leaving any unrelated file already in `.agents/skills/` untouched.

---

### P1: Codex native skill bundle ⭐ MVP

**User Story**: As a Codex CLI user, I want to run gitwise's four commands from inside a Codex session in my own project, the same way Claude Code plugin users already can.

**Why P1**: "All features of gitwise" includes the in-tool agent experience, not just the standalone `gw` binary.

**Acceptance Criteria**:

1. The build-time generator SHALL produce a `SKILL.md` bundle per command (commit, review, pr, release), each with `name` and `description` frontmatter following the Agent Skills standard Codex reads, targeting `.agents/skills/gitwise-<command>/` once installed via `gw skills install codex`.
2. Each skill's instructions SHALL invoke the corresponding thin Node script from the installed `@denisvieiradev/gitwise-skills` package (resolved via Node module resolution from the user's project, not a `${CLAUDE_PLUGIN_ROOT}`-style env var, since Codex does not provide one) — adapting, not reusing verbatim, the workspace-relative-path technique the removed `.gemini/skills/*` files demonstrated.
3. WHEN a Codex session's working directory is a project where `gw skills install codex` has been run THEN the skill SHALL be discoverable, per Codex's documented `.agents/skills` directory-walk behavior.

**Independent Test**: In a scratch project with `gw skills install codex` already run and `@denisvieiradev/gitwise-skills` installed as a dependency, a Codex CLI session in that project discovers and follows the `gitwise-commit` skill's instructions.

---

### P1: Kiro native skill bundle ⭐ MVP

**User Story**: As a Kiro user, I want to run gitwise's four commands from inside Kiro in my own project, the same way Claude Code plugin users already can.

**Why P1**: Same rationale as the Codex skill bundle, for the Kiro ecosystem.

**Acceptance Criteria**:

1. The build-time generator SHALL produce a `SKILL.md` bundle per command, each with `name` and `description` frontmatter following the Agent Skills standard Kiro reads, targeting `.kiro/skills/gitwise-<command>/` once installed via `gw skills install kiro`.
2. Each skill's instructions SHALL invoke the corresponding thin Node script from the installed `@denisvieiradev/gitwise-skills` package.

**Independent Test**: A unit test asserts the generator's Kiro output has valid frontmatter and instructions referencing the correct installed-package script path (live in-Kiro triggering is not verifiable without a paid account, per the logged assumption).

---

### P1: Copilot native instructions surface ⭐ MVP

**User Story**: As a GitHub Copilot CLI user, I want Copilot to know how to run gitwise's four commands in my own project when I ask it to, without gitwise clobbering any custom instructions I've already written.

**Why P1**: Copilot's closest equivalent to a "native skill," given it has no invocable-skill mechanism.

**Acceptance Criteria**:

1. The build-time generator SHALL produce `gitwise.instructions.md`, describing all four commands (commit, review, pr, release), the underlying script invocation for each, and when to use each one — scoped via Copilot's modular-instructions `applyTo` convention rather than the shared `copilot-instructions.md` — targeting `.github/instructions/gitwise.instructions.md` once installed via `gw skills install copilot`.
2. The system SHALL NOT modify or overwrite an existing `.github/copilot-instructions.md` file in the user's project.
3. WHEN a Copilot CLI session runs inside a project where `gw skills install copilot` has been run THEN the instructions file SHALL be discovered per Copilot's documented modular-instructions loading path (`.github/instructions/**/*.instructions.md`).

**Independent Test**: In a scratch project with a pre-existing, hand-written `.github/copilot-instructions.md`, running `gw skills install copilot` adds `.github/instructions/gitwise.instructions.md` without altering the pre-existing file's content.

---

### P1: Retire unused Gemini surface ⭐ MVP

**User Story**: As a gitwise maintainer, I want the dead `.gemini/*` configuration removed, so the repository doesn't carry undocumented files that look like a supported integration but never worked as one.

**Why P1**: Directly requested; leaving `.gemini/*` in place while building the real Codex/Kiro/Copilot distribution mechanism would leave a confusing, inconsistent precedent in the same codebase.

**Acceptance Criteria**:

1. The system SHALL remove `.gemini/settings.json` and `.gemini/skills/` from the repository.
2. The system SHALL NOT introduce a `gw skills install gemini` option or any other Gemini-specific replacement as part of this feature — Gemini support, if revisited, is a separate future feature.

**Independent Test**: `git ls-files .gemini` returns no results after this feature merges.

---

### P1: Per-provider model configuration ⭐ MVP

**User Story**: As a `gw` user who switches providers, I want each provider to remember its own fast/balanced/powerful model IDs, so switching providers doesn't require me to manually fix model strings that belong to a different tool's namespace.

**Why P1**: Required for real configuration parity with Claude Code today — without this, every non-Claude provider is second-class the moment tier routing is involved, since the current shared `models` block defaults to Claude model IDs.

**Acceptance Criteria**:

1. The system SHALL store `UserConfig.models` as a per-provider map keyed by provider kind (`api`, `claude-code`, `codex`, `copilot`, `kiro`), each holding its own `{fast, balanced, powerful}` model-ID strings.
2. The system SHALL ship sensible default model IDs for each of the five provider keys (Claude defaults unchanged for `api`/`claude-code`; Codex/Copilot/Kiro defaults resolved to each vendor's current documented model names during implementation).
3. WHEN a `gw` command runs THEN the system SHALL resolve model IDs from `models[<active provider>]` only, never from another provider's block.
4. WHEN `gw provider` is used to switch providers THEN the system SHALL leave `models` untouched — the newly selected provider's own model block (defaults or previously-saved values) is used automatically, requiring no reset step from the user.
5. IF an existing `~/.gitwise/config.json` has the pre-this-feature flat `models: {fast, balanced, powerful}` shape THEN the system SHALL migrate it, on next read, into `models[<configured provider>]`, backfill the other four provider keys with their defaults, and persist the migrated shape — a one-time, transparent upgrade with no data loss and no required user action.
6. WHEN `<repo>/.gitwise.json`'s `models` override is present THEN the system SHALL apply it to the currently active provider's tier values only, not to every provider's block.
7. WHEN the user runs `gw config models.<tier> <value>` THEN the system SHALL write to the currently active provider's model block. WHEN the user runs `gw config models.<provider>.<tier> <value>` THEN the system SHALL write to that specific provider's block regardless of which provider is currently active.

**Independent Test**: Set provider to `claude-code`, confirm `models.fast` reads a Claude model ID; switch to `codex` via `gw provider`; `models.fast` now reads Codex's default fast-tier model ID with no manual edit; switching back to `claude-code` shows the original Claude model ID, untouched by the round trip.

---

### P1: Documentation accuracy — install, switch, and update ⭐ MVP

**User Story**: As a `gw` user (existing or prospective), I want the README and docs site to accurately describe how to install, switch to, and update each supported AI tool — including the one already there — so I don't get a wrong mental model of what gitwise does with my code or how to stay current.

**Why P1**: Promoted from a documentation nicety to a correctness issue during design review: the README's Privacy section currently states as fact that diffs are sent to Claude — a claim that becomes **false** the moment a user configures Codex/Copilot/Kiro, since diffs would then go to OpenAI/GitHub/AWS instead. Shipping the feature without fixing this ships a privacy claim that isn't true for part of the user base.

**Acceptance Criteria**:

1. The README's **Privacy** section SHALL state which vendor receives diffs conditionally on the configured `provider`, not as a single unconditional claim naming only Claude.
2. `docs/src/content/docs/getting-started.md`'s **Prerequisites** section SHALL list Codex CLI, Copilot CLI, and Kiro CLI as alternative LLM-access options alongside the existing Claude Code CLI / Anthropic API key options, and SHALL mention `gw provider` as the way to choose between them.
3. `docs/src/content/docs/configuration.md` SHALL document the new per-provider `models` shape (`models.<provider>.<tier>`), replacing the current flat-shape documentation, and SHALL document `codexCliPath`, `copilotCliPath`, and `kiroCliPath` alongside `claudeCliPath`.
4. The system SHALL document, for each of the three update paths this feature touches, how a user updates: (a) the `gw` CLI itself — standard `npm install -g @denisvieiradev/gitwise@latest`; (b) the Claude Code plugin — Claude Code's own marketplace auto-update / `/plugin marketplace update` refresh, an existing Claude Code mechanism gitwise does not build, only documents; (c) an installed Codex/Kiro/Copilot native surface — re-running `gw skills install <tool>`.
5. WHERE a reader wants to install a Codex/Kiro/Copilot native surface THEN the docs SHALL show the `gw skills install <tool>` command and its prerequisite (`@denisvieiradev/gitwise-skills` available as a dependency, or installed globally alongside `gw` — resolved during Execute against how the install command actually locates the package).

**Independent Test**: A reader following only the README/docs (no prior knowledge) can correctly answer: "if I use Kiro as my provider, where do my diffs go?", "how do I switch from Claude to Codex?", and "how do I update my installed Copilot instructions after upgrading gitwise?".

---

### P2: Documentation parity

**User Story**: As a prospective `gw` user evaluating AI-tool options, I want the README and configuration docs to list Codex/Copilot/Kiro alongside Claude in the requirements/comparison tables, so I know they're supported before I try.

**Why P2**: Discoverability polish on top of the P1 accuracy fixes above — not required for the feature to function correctly, unlike the Privacy-section fix.

**Acceptance Criteria**:

1. WHEN a reader views the README's **Requirements** table THEN the system SHALL list Codex CLI, Copilot CLI, and Kiro CLI as alternative "LLM access" options alongside Claude Code / `ANTHROPIC_API_KEY`.
2. The system SHALL document `gw skills install <tool>` and `gw provider` in the README's **Commands** table.

**Independent Test**: Grepping `README.md` for `codex`, `copilot`, and `kiro` returns matches in the Requirements table and Commands table.

---

## Edge Cases

- IF a user has multiple provider CLIs installed (e.g. both Codex and Copilot) THEN `gw provider`'s detection list SHALL show all of them, not just the first match, and let the user choose — unlike the current first-run wizard, which stops at the first detected tool.
- IF a `gw` command is invoked with a `provider` value that was valid when set but whose CLI has since been uninstalled THEN the system SHALL raise the same `PROVIDER_UNAVAILABLE` error as a never-configured missing binary — no special "used to work" state is tracked.
- IF `.github/instructions/` does not yet exist in a consuming project THEN `gw skills install copilot` SHALL create that directory rather than failing.
- IF `gw skills install <tool>` is run outside a git repository, or in a directory with no write permission THEN the system SHALL fail with a clear error before partially writing files, not leave a half-installed skill.
- IF the Codex `--json` output is confirmed during implementation to include a usage field after all THEN the system SHALL use it (AC 2 of the Codex story), not the n/a fallback — the n/a path is strictly a fallback for confirmed absence, not a default choice made ahead of verification.
- IF a user's `~/.gitwise/config.json` predates this feature (flat `models` shape) AND its `provider` value is itself invalid/unrecognized THEN the migration (per-provider model story, AC 5) SHALL still backfill all five provider keys with defaults, using the flat block's values only for a provider key it can confidently match — an unrecognized `provider` string falls back to seeding every provider key with its own defaults rather than guessing which one the flat block belonged to.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| PROV-01 | P1: Codex as an LLM provider | Design | Pending |
| PROV-02 | P1: Codex as an LLM provider | Design | Pending |
| PROV-03 | P1: Copilot as an LLM provider | Design | Pending |
| PROV-04 | P1: Copilot as an LLM provider | Design | Pending |
| PROV-05 | P1: Kiro as an LLM provider | Design | Pending |
| PROV-06 | P1: Kiro as an LLM provider | Design | Pending |
| PROV-07 | P1: Codex/Copilot/Kiro as an LLM provider (cross-cutting) | Design | Pending |
| CFG-01 | P1: Easy provider switching | Design | Pending |
| CFG-02 | P1: Easy provider switching | Design | Pending |
| CFG-03 | P1: Easy provider switching | Design | Pending |
| MDL-01 | P1: Per-provider model configuration | Design | Pending |
| MDL-02 | P1: Per-provider model configuration | Design | Pending |
| MDL-03 | P1: Per-provider model configuration | Design | Pending |
| MDL-04 | P1: Per-provider model configuration | Design | Pending |
| MDL-05 | P1: Per-provider model configuration | Design | Pending |
| MDL-06 | P1: Per-provider model configuration | Design | Pending |
| MDL-07 | P1: Per-provider model configuration | Design | Pending |
| DIST-01 | P1: `gw skills install` — real native-surface distribution | Design | Pending |
| DIST-02 | P1: `gw skills install` — real native-surface distribution | Design | Pending |
| DIST-03 | P1: `gw skills install` — real native-surface distribution | Design | Pending |
| DIST-04 | P1: `gw skills install` — real native-surface distribution | Design | Pending |
| DIST-05 | P1: `gw skills install` — real native-surface distribution | Design | Pending |
| DIST-06 | P1: `gw skills install` — real native-surface distribution | Design | Pending |
| SKILL-01 | P1: Codex native skill bundle | Design | Pending |
| SKILL-02 | P1: Codex native skill bundle | Design | Pending |
| SKILL-03 | P1: Codex native skill bundle | Design | Pending |
| SKILL-04 | P1: Kiro native skill bundle | Design | Pending |
| SKILL-05 | P1: Kiro native skill bundle | Design | Pending |
| SKILL-06 | P1: Copilot native instructions surface | Design | Pending |
| SKILL-07 | P1: Copilot native instructions surface | Design | Pending |
| SKILL-08 | P1: Copilot native instructions surface | Design | Pending |
| GEM-01 | P1: Retire unused Gemini surface | Design | Pending |
| GEM-02 | P1: Retire unused Gemini surface | Design | Pending |
| DOC-01 | P1: Documentation accuracy — install, switch, and update | Design | Pending |
| DOC-02 | P1: Documentation accuracy — install, switch, and update | Design | Pending |
| DOC-03 | P1: Documentation accuracy — install, switch, and update | Design | Pending |
| DOC-04 | P1: Documentation accuracy — install, switch, and update | Design | Pending |
| DOC-05 | P1: Documentation accuracy — install, switch, and update | Design | Pending |
| DOC-06 | P2: Documentation parity | Design | Pending |
| DOC-07 | P2: Documentation parity | Design | Pending |

**ID format:** `[CATEGORY]-[NUMBER]` — `PROV` (provider backends, cross-cutting behaviors like usage-n/a and system-prompt folding), `CFG` (config/switching UX), `MDL` (per-provider model configuration), `DIST` (the `gw skills install` distribution mechanism), `SKILL` (per-tool generated adapter content), `GEM` (Gemini removal), `DOC` (documentation).

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 40 total, 0 mapped to tasks, 40 unmapped ⚠️ (expected pre-Design)

---

## Success Criteria

- [ ] `gw commit|review|pr|release` succeed end-to-end with `provider` set to each of `codex`, `copilot`, and `kiro` (Kiro verified via mocked subprocess I/O, per logged assumption).
- [ ] `gw provider` detects and lists every installed supported CLI and persists the user's selection correctly.
- [ ] `gw config provider <invalid>` fails with a clear error instead of silently persisting bad state.
- [ ] `gw skills install {codex,kiro,copilot}` installs valid, correctly-referenced files into a real end-user project (not just gitwise's own repo), and re-running it after a version bump updates those files in place.
- [ ] Codex and Kiro generated skill bundles have valid Agent Skills frontmatter; the Copilot instructions file exists and does not touch any pre-existing `.github/copilot-instructions.md`.
- [ ] `.gemini/settings.json` and `.gemini/skills/` no longer exist in the repository.
- [ ] Switching providers via `gw provider` never requires the user to manually fix model-ID strings — each provider resolves models from its own block.
- [ ] An existing user's pre-feature `~/.gitwise/config.json` (flat `models` shape) loads correctly post-upgrade with no manual edit and no data loss.
- [ ] The README's Privacy section accurately reflects that the configured provider determines which vendor receives diffs — it no longer names only Claude unconditionally.
- [ ] Zero regressions in existing Claude Code / Anthropic API behavior (existing test suite stays green).
