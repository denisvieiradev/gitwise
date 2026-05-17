---
title: devflow pr
description: Create a pull request from feature branch
---

```bash
devflow pr [ref] [--base <branch>]
```

Creates a GitHub pull request with an AI-generated title and description.

## Arguments & Options

| Argument/Option | Description |
|-----------------|-------------|
| `ref` | Feature reference (optional) |
| `--base` | Base branch (default: `main`) |

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated

## What it does

1. Analyzes commits on the current branch
2. Generates PR title and structured description
3. Shows preview and asks for confirmation
4. Pushes branch and creates PR via `gh`
5. Updates phase to `pr_created`
