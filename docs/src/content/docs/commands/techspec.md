---
title: devflow techspec
description: Generate a technical specification from a PRD
---

```bash
devflow techspec <ref>
```

Generates a detailed technical specification from an existing PRD.

## Arguments

| Argument | Description |
|----------|-------------|
| `ref` | Feature reference (number or slug, e.g., `001`) |

## Prerequisites

- PRD must exist (run `devflow prd` first)

## What it does

1. Reads the PRD from `.devflow/features/[ref]/prd.md`
2. Checks for drift (warns if PRD changed since last generation)
3. Generates tech spec using the `powerful` model tier
4. Saves to `.devflow/features/[ref]/techspec.md`
5. Updates state to `techspec_created`
