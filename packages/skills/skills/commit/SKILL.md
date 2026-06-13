---
name: commit
description: Use when the user asks to commit changes, generate a commit message, or stage and commit files. Analyzes the staged git diff with AI and produces a Conventional Commits message, detecting whether the diff is one logical change or multiple contexts and offering an interactive commit-split when it is multiple.
---

# Commit

## Tool allowlist
- Bash: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/commit.js"`
- Bash: `git add`
- Bash: `git status`
- Read: any file in the working directory

## Instructions
1. Run `git status` to see staged and unstaged changes.
2. If no files are staged, offer to stage all or let the user select.
3. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/commit.js" "<intent>"` where `<intent>` is the user's description (may be empty).
4. Display the emitted markdown plan to the user.
5. Ask for confirmation. If the user approves:
   - Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/commit.js" "<intent>" --apply` (the plan is re-emitted and applied).
6. If the user edits the message, update it before applying.
7. After applying, run `git log --oneline -3` to confirm.

## Flags
- `--split auto|never|always` — control multi-context splitting (default: auto)
- `--apply` — apply the plan (stage files + commit)
- `--push` — push after committing
