---
title: gw issue
description: AI-drafted GitHub issue — file a bug or feature request from a description
---

```bash
gw issue "<description>" [options]
```

Drafts a structured GitHub issue (title + body) from a free-text description using AI,
then creates it via the `gh` CLI. The drafter decides whether the description is a bug
report or a feature request and shapes the body accordingly (steps to reproduce vs.
acceptance criteria).

## Arguments & Options

| Argument/Option | Description |
|-----------------|-------------|
| `description` | Free-text description of the bug or feature (required) |
| `--label <a,b>` | Comma-separated labels to attach to the issue |
| `--assignee <user>` | Assign the issue — repeatable or comma-separated |
| `--prompt <text>` | Additional focus instructions for the drafter |
| `--apply` | Create the issue immediately (omit to only preview the draft) |

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- An API key or Claude Code provider configured (same as the other commands)

## What it does

1. Takes your description (plus the current branch as context, when available).
2. Generates a clear issue title and a structured body via the LLM.
3. Shows a preview (title, labels, assignees, body) and asks for confirmation.
4. On `--apply`, creates the issue with `gh issue create` and returns its URL.

## Examples

```bash
# Preview a bug-report draft (nothing is created)
gw issue "Logout button does nothing on mobile Safari"

# Create the issue with labels and an assignee
gw issue "Add dark mode toggle to settings" --label "enhancement,ui" --assignee me --apply

# Steer the drafter with extra context
gw issue "Crash on import" --prompt "Focus on the CSV parser; include the stack trace location" --apply
```

## Exit codes

| Code | Meaning |
|------|---------|
| `INVALID_INTENT` (11) | No description was provided |
| `GH_FAILED` (21) | `gh` is unavailable or returned empty output — check `gh auth status` |

See [Exit Codes](/exit-codes/) for the full list.
