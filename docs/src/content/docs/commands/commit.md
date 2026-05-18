---
title: gw commit
description: Generate intelligent commit messages from staged changes
---

```bash
gw commit [intent] [options]
```

Analyzes staged changes and generates a conventional commit message using AI.

## Arguments & Options

| Argument/Option | Description |
|-----------------|-------------|
| `intent` | Optional free-text description of what the changes are for |
| `--message <m>` | Use this commit message directly and skip the LLM |
| `--base <branch>` | Target merge-base branch (passed to the LLM as context) |
| `--split <mode>` | Split mode: `auto` \| `never` \| `always` (default: `auto`) |
| `--push` | Push to remote after committing |
| `--no-confirm` | Skip the confirmation prompt and apply immediately |
| `--apply` | Alias for `--no-confirm` |

## What it does

1. Reads the staged diff (`git diff --cached`)
2. Generates a conventional commit message (or a split commit plan) via the LLM
3. Shows the proposed message(s) and asks for confirmation
4. Commits with the generated message
5. Optionally pushes to remote
