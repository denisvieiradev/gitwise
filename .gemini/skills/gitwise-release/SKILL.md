---
name: gitwise-release
description: Drives the gitwise release lifecycle (prepare, finish, abort). Suggests version bumps, generates changelogs, and creates GitHub releases. Use when asked to create a release, bump version, or publish.
---

# gitwise-release

## Subcommands

### `prepare` — plan and persist
1. Run: `node packages/skills/dist/scripts/release.js prepare [--bump <type>]`
2. Display the plan (version, changelog, release notes).
3. Notify the user they can edit `.gitwise/release-<version>.md` before finishing.

### `finish` — apply the plan
1. Run: `node packages/skills/dist/scripts/release.js finish [--no-gh-release] [--no-workspace-propagation] [--no-delete-branch]`
2. Confirm the new version and tag.

### `abort` — discard the plan
1. Run: `node packages/skills/dist/scripts/release.js abort [--delete-branch]`
2. Confirm the plan has been cleared.

### Legacy one-shot (no subcommand)
1. Run: `node packages/skills/dist/scripts/release.js [--bump <type>]`
2. Display the plan, ask for confirmation, then on approval:
   - Run: `node packages/skills/dist/scripts/release.js [--bump <type>] --apply`

## Flags
- `--bump <major|minor|patch>` — override the AI-suggested bump type.
- `--apply` — tag and push, update CHANGELOG.md, create GitHub release.
- `--no-gh-release` — skip creating a GitHub release.
- `--no-workspace-propagation` — skip propagating the new version.
- `--no-delete-branch` — keep the release branch after merging.
- `--delete-branch` — also delete the release branch when aborting.
