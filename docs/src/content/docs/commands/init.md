---
title: devflow init
description: Initialize devflow in your project
---

```bash
devflow init [--force]
```

Scans your project to detect language, framework, test framework, and CI configuration. Prompts for LLM provider and context mode preferences.

## Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing config |

## What it does

1. Verifies you're in a git repository
2. Scans project for language, framework, tests, and CI
3. Prompts for provider and context mode
4. Creates `.devflow/config.json` and `.devflow/state.json`
5. Warns if `gh` CLI is not installed

## Example

```bash
$ devflow init
◆ devflow init
│ Detected: typescript (express), jest, CI found
│ LLM Provider:
│   ● Claude (API Key) — requires Anthropic API key
│   ○ Claude Code (CLI) — uses your Claude Code subscription
│ Context mode: Normal
│ Config saved to .devflow/config.json
```

When selecting **Claude Code (CLI)**, the API key prompt is skipped — devflow uses the `claude` CLI with your existing Claude subscription instead.
