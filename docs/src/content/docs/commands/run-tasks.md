---
title: devflow run-tasks
description: Execute tasks sequentially with auto-commit
---

```bash
devflow run-tasks <ref>
```

Executes all pending tasks sequentially, committing after each one.

## Arguments

| Argument | Description |
|----------|-------------|
| `ref` | Feature reference (number or slug) |

## Prerequisites

- Tasks must exist (run `devflow tasks` first)

## What it does

1. Reads pending tasks from state
2. For each task: analyzes requirements, generates implementation guidance, commits
3. Marks tasks as completed in state
4. Updates phase to `in_progress`
