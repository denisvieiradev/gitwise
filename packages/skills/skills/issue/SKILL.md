---
name: issue
description: Use when the user asks to open a GitHub issue, file a bug, or create a feature request. Drafts a structured issue title and body from a free-text description with AI, then creates the issue via gh.
---

# Issue

## Tool allowlist
- Bash: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/issue.js"`
- Bash: `gh issue list`
- Read: any file in the working directory

## Instructions
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/issue.js" "<description>" [--label a,b] [--assignee user]`
2. Display the emitted markdown draft (title + body) to the user.
3. Ask for confirmation. If the user approves:
   - Run the same command with `--apply` appended.
4. Show the issue URL returned.

## Flags
- `--label <a,b>` — comma-separated labels to attach
- `--assignee <user>` — assign the issue (repeatable or comma-separated)
- `--prompt "<text>"` — extra focus instructions for the drafter
- `--apply` — create the GitHub issue (omit to only preview the draft)
