---
name: gitwise-commit
description: Analyzes staged git changes using AI and generates a conventional commit message. Supports multi-context splitting into separate commits. Use when asked to commit changes, generate a commit message, or stage and commit files.
---

# gitwise-commit

## Instructions

1. Run `git status` to see staged and unstaged changes.
2. If no files are staged, offer to stage all or let the user select.
3. Execute the commit runner:
   `node packages/skills/dist/scripts/commit.js "<intent>"`
   where `<intent>` is the user's description (may be empty).
4. Display the emitted markdown plan to the user.
5. Ask for confirmation. If the user approves:
   - Run: `node packages/skills/dist/scripts/commit.js "<intent>" --apply`
6. If the user edits the message, update it before applying.
7. After applying, confirm with `git log --oneline -3`.

## Flags
- `--split auto|never|always` — control multi-context splitting (default: auto)
- `--apply` — apply the plan (stage files + commit)
- `--push` — push after committing
