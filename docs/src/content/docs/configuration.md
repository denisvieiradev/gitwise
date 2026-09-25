---
title: Configuration
description: Configure gitwise
---

## Config Files

gitwise reads configuration from two layered locations:

1. **User config** — `~/.gitwise/config.json` (created on first run)
2. **Repo config** — `<repo>/.gitwise.json` (optional, overrides user config for that repo)

### User config example (`~/.gitwise/config.json`)

```json
{
  "provider": "codex",
  "codexCliPath": "/opt/homebrew/bin/codex",
  "models": {
    "api": { "fast": "claude-haiku-4-5-20251001", "balanced": "claude-sonnet-4-6", "powerful": "claude-opus-4-7" },
    "claude-code": { "fast": "claude-haiku-4-5-20251001", "balanced": "claude-sonnet-4-6", "powerful": "claude-opus-4-7" },
    "codex": { "fast": "gpt-6-sol", "balanced": "gpt-6-sol", "powerful": "gpt-6-astra" },
    "copilot": { "fast": "claude-haiku-4.5", "balanced": "claude-sonnet-4.6", "powerful": "claude-opus-4.7" },
    "kiro": { "fast": "claude-haiku-4.5", "balanced": "claude-sonnet-4.5", "powerful": "claude-sonnet-4.5" }
  },
  "language": "en",
  "commitConvention": "conventional"
}
```

### Repo config example (`<repo>/.gitwise.json`)

All fields are optional and override the user config for the current repository.

```json
{
  "models": {
    "balanced": "claude-sonnet-4-6"
  },
  "language": "en",
  "defaultBaseBranch": "main",
  "commitConvention": "conventional",
  "workspacePropagation": true
}
```

## Options

### provider

LLM provider to use:

- **`"api"`** — Uses the Anthropic API directly. Reads `ANTHROPIC_API_KEY` from the environment or from `~/.gitwise/.env`.
- **`"claude-code"`** — Shells out to the Claude Code CLI. Requires the `claude` CLI installed and authenticated with an active Claude subscription. No API key needed.
- **`"codex"`** — Shells out to the OpenAI Codex CLI (`codex exec`). Requires `codex` installed and authenticated.
- **`"copilot"`** — Shells out to the GitHub Copilot CLI (`copilot -p`). Requires `copilot` installed and authenticated. Copilot does not report token usage, so `gw` prints `Tokens: n/a`.
- **`"kiro"`** — Shells out to the Kiro CLI (`kiro-cli chat --no-interactive`). Requires `kiro-cli` installed and a qualifying Kiro subscription. Kiro does not report token usage either.

Pick one interactively with `gw provider`, or set it directly with `gw config provider <value>`; an unrecognized value is rejected. Diffs go to the vendor behind the provider you choose.

### claudeCliPath, codexCliPath, copilotCliPath, kiroCliPath

Optional absolute path to the provider's binary. When unset, gitwise looks in the common install locations, then `PATH`. `gw provider` writes the detected path for you.

### models

Model IDs live in a per-provider map, `models.<provider>.<tier>`, so switching providers never leaves one vendor's model names in another's calls. Only the active provider's block is used.

Tiers:

- **fast** — Lightweight tasks
- **balanced** — Default tasks (commit, review, pr)
- **powerful** — Heavier reasoning tasks

Read or write them with `gw config`:

```bash
gw config models.balanced my-model            # writes to the active provider's block
gw config models.codex.fast gpt-6-sol          # writes to Codex's block, whichever provider is active
```

`gw provider` never touches `models`, so each provider keeps its saved values across switches. A config from an older release with a single flat `models` block is migrated into the configured provider's block on first read (or into `api`'s block when no provider is set). The former default Codex fast model (`gpt-6-luna`) is updated to `gpt-6-sol` when reading user config because some ChatGPT accounts reject Luna.

If Codex rejects a selected model for the current ChatGPT account or CLI version, Gitwise retries once with `gpt-5.6-sol`. If Copilot CLI rejects its selected model, Gitwise retries once with Copilot's automatic model selection.

A repo's `<repo>/.gitwise.json` can override `models` in two forms. The per-provider form targets each named provider and is the one to use in a repo shared by people on different providers:

```json
{ "models": { "codex": { "balanced": "gpt-6-sol" }, "claude-code": { "fast": "claude-haiku-4-5-20251001" } } }
```

The flat form applies to whichever provider is active for the person running the command, so its model ID reaches every provider a teammate might use:

```json
{ "models": { "balanced": "my-team-model" } }
```

The two forms can be combined in one file. Flat tiers go to the active provider, and a per-provider block wins over a flat tier for the same provider and tier.

### language

Output language for generated content.

### defaultBaseBranch

Override the auto-detected base branch (`main`/`master`) used by `gw review` and `gw pr`.

### commitConvention

`conventional` | `gitmoji` | `angular` | `kernel` | `custom`

### workspacePropagation (repo-only)

When `true`, `gw release` propagates the new version to all `packages/*` in a monorepo.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required for `api` provider). Read from the environment first, then `~/.gitwise/.env`. |
| `NO_COLOR` | Disable ANSI color output (also `--no-color`). |
