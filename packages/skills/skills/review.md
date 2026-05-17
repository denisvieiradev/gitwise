# gitwise-review

**Trigger**: When the user asks for a code review, wants feedback on changes, or asks to review a diff.

## Description
Performs an AI-powered code review of the diff between the current branch and the base branch. Returns findings categorized as Critical, Suggestions, and Nitpicks.

## Tool allowlist
- Bash: `node packages/skills/dist/scripts/review.js`
- Bash: `git diff`
- Bash: `git log`
- Read: any file in the working directory

## Instructions
1. Run: `node packages/skills/dist/scripts/review.js [--base <branch>]`
2. Display the emitted markdown (Critical / Suggestions / Nitpicks sections) to the user.
3. Discuss findings with the user and offer to implement fixes.

## Flags
- `--base <branch>` — base branch for diff (default: auto-detect main/master)
- `--prompt "<text>"` — additional focus instructions for the reviewer
