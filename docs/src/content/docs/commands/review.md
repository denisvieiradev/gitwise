---
title: gw review
description: AI-powered code review with categorized findings
---

```bash
gw review [options]
```

Performs an automated code review on the diff between the current branch and the base branch, printing findings grouped by severity.

## Options

| Option | Description |
|--------|-------------|
| `--base <branch>` | Base branch to diff against (default: auto-detect `main`/`master`) |
| `--prompt <text>` | Additional focus instructions for the reviewer |

## What it does

1. Computes the diff between the current branch and the base
2. Sends the diff to the LLM for review
3. Categorizes findings: **Critical**, **Suggestions**, **Nitpicks**
4. Prints findings to the terminal with token usage
