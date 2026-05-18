---
title: gw pr
description: AI-drafted pull request — create or update a GitHub PR
---

```bash
gw pr [options]
```

Drafts a GitHub pull request title and description from the current branch's commits, then creates or updates the PR via the `gh` CLI.

## Options

| Option | Description |
|--------|-------------|
| `--base <branch>` | Base branch for the PR (default: auto-detect `main`/`master`) |
| `--prompt <text>` | Additional focus instructions for the PR drafter |
| `--apply` | Skip confirmation and create/update the PR immediately |
| `--draft` | Create the PR as a draft |

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated

## What it does

1. Analyzes the commits on the current branch against the base
2. Generates a PR title and structured description
3. Shows a preview and asks for confirmation
4. Pushes the branch and creates (or updates) the PR via `gh`
