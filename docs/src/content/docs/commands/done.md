---
title: devflow done
description: Finalize a feature and update state
---

```bash
devflow done <ref>
```

Marks a feature as complete and updates state.

## Arguments

| Argument | Description |
|----------|-------------|
| `ref` | Feature reference (number or slug) |

## What it does

1. Checks for pending tasks (warns if any)
2. Asks for confirmation if tasks are pending
3. Updates phase to `done`
