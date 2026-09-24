---
name: gitwise-review
description: Use when the user asks for a code review, wants feedback on changes, or asks to review a diff. Performs an AI code review of the diff between the current branch and the base branch, returning findings categorized as Critical, Suggestions, and Nitpicks.
---

# gitwise-review

## Instructions
1. Run: `node "$(node -p "require.resolve('@denisvieiradev/gitwise-skills/package.json').replace(/package\.json$/, '')")dist/scripts/review.js" [--base <branch>]`
2. Display the emitted markdown (Critical / Suggestions / Nitpicks sections) to the user.
3. Discuss findings with the user and offer to implement fixes.

## Flags
- `--base <branch>` — base branch for diff (default: auto-detect main/master)
- `--prompt "<text>"` — additional focus instructions for the reviewer
