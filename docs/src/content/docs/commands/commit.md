---
title: devflow commit
description: Generate intelligent commit messages from staged changes
---

```bash
devflow commit [--push]
```

Analyzes staged changes and generates a conventional commit message using AI.

## Options

| Option | Description |
|--------|-------------|
| `--push` | Push to remote after committing |

## What it does

1. Reads staged diff (`git diff --cached`)
2. Generates conventional commit message via LLM
3. Shows message and asks for confirmation
4. Commits with the generated message
5. Optionally pushes to remote
