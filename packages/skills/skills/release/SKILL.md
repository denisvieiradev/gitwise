---
name: release
description: Use when the user asks to create a release, bump the version, publish a new version, or step through release prepare / finish / abort. Suggests a semantic version bump, generates a changelog entry and release notes, tags the commit, and optionally creates a GitHub release.
---

# Release

## Tool allowlist
- Bash: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js"`
- Bash: `git log`
- Bash: `git tag`
- Bash: `gh release create`
- Read: any file in the working directory

## Subcommands

### `prepare` — plan and persist (no tag, no push)
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js" prepare [--bump <type>]`
2. Display the emitted markdown plan (version, changelog, release notes) to the user.
3. Tell the user they can edit `.gitwise/release-<version>.md` before finishing.

### `finish` — apply the persisted plan
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js" finish [--no-gh-release] [--no-workspace-propagation] [--no-delete-branch]`
2. Confirm the new version and tag to the user.

### `abort` — discard the persisted plan
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js" abort [--delete-branch]`
2. Confirm the plan has been cleared. Pass `--delete-branch` only when the user explicitly asks to remove the release branch — the skill defaults to keeping it.

### Legacy one-shot (no subcommand)
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js" [--bump <type>]`
2. Display the plan, ask for confirmation, then on approval:
   - Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js" [--bump <type>] --apply`
3. Show the new version and tag.

## Flags
- `--bump <major|minor|patch>` — override the AI-suggested bump type (legacy + `prepare`).
- `--apply` — tag and push, update CHANGELOG.md, create GitHub release (legacy one-shot only).
- `--no-gh-release` — skip creating a GitHub release (tag only) (legacy + `finish`).
- `--no-workspace-propagation` — skip propagating the new version to `packages/*/package.json` (legacy + `finish`).
- `--no-delete-branch` — keep the release branch after merging (`finish`, gitflow only).
- `--delete-branch` — also delete the release branch when aborting (`abort`, gitflow only).

## Errors
On failure the script exits non-zero and prints `Error [<code>]: <message>` to stderr. React to the typed `code` (e.g. `NO_RELEASE_PLAN`, `STALE_PLAN_TAG_EXISTS`, `WORKING_TREE_DIRTY`) and surface the message to the user.
