---
name: gitwise-review
description: Performs an AI-powered code review of the diff between the current branch and the base branch. Returns findings categorized as Critical, Suggestions, and Nitpicks. Use when asked for a code review or feedback on changes.
---

# gitwise-review

## Instructions

1. Execute the review runner:
   `node packages/skills/dist/scripts/review.js [--base <branch>]`
2. Display the emitted markdown (Critical / Suggestions / Nitpicks sections) to the user.
3. Discuss findings with the user and offer to implement fixes.

## Flags
- `--base <branch>` — base branch for diff (default: auto-detect main/master)
- `--prompt "<text>"` — additional focus instructions for the reviewer
