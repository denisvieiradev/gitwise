---
title: devflow tasks
description: Decompose a tech spec into implementable tasks
---

```bash
devflow tasks <ref>
```

Breaks down a tech spec into numbered, implementable tasks with success criteria.

## Arguments

| Argument | Description |
|----------|-------------|
| `ref` | Feature reference (number or slug) |

## Prerequisites

- Tech spec must exist (run `devflow techspec` first)

## What it does

1. Reads PRD + tech spec
2. Checks for drift warnings
3. Generates task list and individual task files
4. Saves `tasks.md` + `[N]_task.md` files
5. Updates state to `tasks_created`
