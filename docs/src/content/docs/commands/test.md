---
title: devflow test
description: Generate and run tests based on requirements
---

```bash
devflow test <ref>
```

Generates a test plan from PRD/tech spec and optionally runs the project's test suite.

## Arguments

| Argument | Description |
|----------|-------------|
| `ref` | Feature reference (number or slug) |

## What it does

1. Reads PRD and tech spec
2. Generates comprehensive test plan via LLM
3. Saves test plan to `.devflow/features/[ref]/test-plan.md`
4. Optionally runs `npm test` if test framework detected
5. Updates phase to `testing`
