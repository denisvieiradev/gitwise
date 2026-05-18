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
  "provider": "api",
  "models": {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-6",
    "powerful": "claude-opus-4-7"
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

### models

Model IDs for each complexity tier:

- **fast** — Lightweight tasks
- **balanced** — Default tasks (commit, review, pr)
- **powerful** — Heavier reasoning tasks

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
