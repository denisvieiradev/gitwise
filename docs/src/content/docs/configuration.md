---
title: Configuration
description: Configure devflow-cli for your project
---

## Config File

After running `devflow init`, a `.devflow/config.json` file is created:

```json
{
  "provider": "claude-code-api-key",
  "models": {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-5-20250929",
    "powerful": "claude-opus-4-5-20250929"
  },
  "language": "en",
  "commitConvention": "conventional",
  "branchPattern": "feature/{{slug}}",
  "templatesPath": ".devflow/templates",
  "contextMode": "normal",
  "project": {
    "name": "my-project",
    "language": "typescript",
    "framework": "express",
    "testFramework": "jest",
    "hasCI": true
  }
}
```

## Options

### provider

LLM provider to use. Available options:

- **`"claude-code-api-key"`** — Uses the Anthropic API directly with an API key. Requires `ANTHROPIC_API_KEY` to be set.
- **`"claude-code-cli"`** — Uses the Claude Code CLI as a subprocess. Requires the `claude` CLI installed and authenticated with an active Claude subscription (Max/Pro). No API key needed.

### models

Model IDs for each complexity tier:

- **fast** — Used for simple tasks (commit, status, pr)
- **balanced** — Used for medium tasks (tasks, run-tasks, test)
- **powerful** — Used for complex tasks (prd, techspec, review)

### contextMode

- **normal** — Sends full documents as context (best quality, higher cost)
- **light** — Chunks documents by headings, limits to ~4000 tokens (lower cost)

### branchPattern

Pattern for feature branch names. `{{slug}}` is replaced with the feature slug.

### templatesPath

Path to custom template overrides. Defaults to `.devflow/templates`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required for `claude-code-api-key` provider) |
| `DEVFLOW_LLM_PROVIDER` | Override provider from config |
| `DEVFLOW_API_KEY` | Alternative to ANTHROPIC_API_KEY |

## Gitignore

Add these to your `.gitignore`:

```
.devflow/config.json
.devflow/state.json
```

Features, templates, and reviews should be committed — they are valuable project documentation.
