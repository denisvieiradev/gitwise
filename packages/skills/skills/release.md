# gitwise-release

**Trigger**: When the user asks to create a release, bump the version, or publish a new version.

## Description
Suggests a semantic version bump, generates a changelog entry and release notes, then tags the commit and optionally creates a GitHub release.

## Tool allowlist
- Bash: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js"`
- Bash: `git log`
- Bash: `git tag`
- Bash: `gh release create`
- Read: any file in the working directory

## Instructions
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js" [--bump <type>]`
2. Display the emitted markdown plan (version, changelog, release notes) to the user.
3. Ask for confirmation. If the user approves:
   - Run: `node "${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js" [--bump <type>] --apply`
4. Show the new version and tag.

## Flags
- `--bump <major|minor|patch>` — override the AI-suggested bump type
- `--apply` — tag and push, update CHANGELOG.md, create GitHub release
- `--no-gh-release` — skip creating a GitHub release (tag only)
