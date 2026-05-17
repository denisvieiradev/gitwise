---
title: devflow review
description: Automated code review with categorized findings
---

```bash
devflow review <ref> [--base <branch>]
```

Performs automated code review by analyzing the diff against the base branch.

## Arguments & Options

| Argument/Option | Description |
|-----------------|-------------|
| `ref` | Feature reference (number or slug) |
| `--base` | Base branch for diff (default: `main`) |

## What it does

1. Gets diff between current branch and base
2. Sends diff + tech spec to LLM for review
3. Categorizes findings: Critical, Suggestions, Nitpicks
4. Saves review to `.devflow/features/[ref]/review.md`
5. Warns if critical findings detected (suggests fix loop)
6. Updates phase to `reviewing`
