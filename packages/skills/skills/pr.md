# gitwise-pr

**Trigger**: When the user asks to open a pull request, draft a PR, or create a PR from the current branch.

## Description
Generates a PR title and body from the diff between the current branch and the base branch. Creates or updates the GitHub PR using `gh`.

## Tool allowlist
- Bash: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/pr.js"`
- Bash: `git diff`
- Bash: `git log`
- Bash: `gh pr view`
- Read: any file in the working directory

## Instructions
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/pr.js" [--base <branch>]`
2. Display the emitted markdown plan (title + body) to the user.
3. Ask for confirmation. If the user approves:
   - Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/pr.js" [--base <branch>] --apply`
4. Show the PR URL returned.

## Flags
- `--base <branch>` — base branch for diff (default: auto-detect main/master)
- `--apply` — create or update the GitHub PR
- `--prompt "<text>"` — additional focus instructions for the PR drafter
