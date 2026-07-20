# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-07-20

### Added
- Added README documentation for CLI and skills packages

### Changed
- Upgraded npm in CI release workflow to support OIDC trusted publishing
- Reconciled release documentation with Phase 1 and passphrase-less GPG key configuration

## [Unreleased]

## [0.1.0] - 2026-06-11 — gitwise initial release

`gitwise` is a focused AI git toolbelt — `commit`, `review`, `pr`, `release` —
distributed as both a CLI (`gw`) and a Claude Code plugin. The locked-version
monorepo (`@denisvieiradev/gitwise-core`, `@denisvieiradev/gitwise`,
`@denisvieiradev/gitwise-skills`) starts at `0.1.0`.

### Added
- `gw release prepare [version]` and `gw release finish` subcommands split the
  release flow into an explicit plan-then-apply lifecycle backed by a persisted
  `.gitwise/release-plan.json` (auto-gitignored, short-lived).
- `gw release abort` discards a saved plan and optionally deletes the release
  branch.
- `gw release finish --no-delete-branch` keeps the release branch after merging
  (gitflow only — useful when CI re-uses the branch).
- Opt-in `RepoConfig.releaseStrategy` (`"github-flow"` default, `"gitflow"`) and
  `RepoConfig.developBranch` (defaults to `"develop"`). GitFlow creates a
  `release/<version>` branch on `prepare` and merges into both the main and the
  develop branches on `finish`.
- New typed error codes surfaced by the release lifecycle:
  `STRATEGY_DEVELOP_MISSING`, `STRATEGY_RELEASE_BRANCH_EXISTS`,
  `STALE_PLAN_TAG_EXISTS`, `STALE_PLAN_BRANCH_MISMATCH`, `NO_RELEASE_PLAN`,
  `INVALID_PLAN_SCHEMA`, `INVALID_PLAN_JSON`, `RELEASE_BRANCH_UNMERGED`.
- Monorepo with three publishable packages (`core`, `cli`, `skills`); locked
  versions across all three.
- `~/.gitwise/config.json` + optional per-repo `<repo>/.gitwise.json` config
  (see README "Configuration").
- API keys live in `~/.gitwise/.env` with `0600` permissions (separated from
  `config.json`).
- `gw pr --update` to refresh the description on an existing branch PR.
- Free-form `prompt` argument on every command (`gw commit "<intent>"`,
  `gw review "<intent>"`, ...).

### Changed
- `gw release` (no subcommand) keeps today's one-shot UX but now drives the
  unified `prepare → confirm → finish` path internally; behavior on a
  single-branch repo is unchanged.
- User-global config layout: `~/.gitwise/` with optional `<repo>/.gitwise.json`
  overrides.
- `review` no longer loads a techspec; it operates on the current branch diff
  vs. base only.

### Removed
- All pipeline commands: `init`, `prd`, `techspec`, `tasks`, `run-tasks`,
  `test`, `done`, `status`.
- Per-feature state directory and state machine; gitwise is stateless.
- Update-checker; may return in a later phase.
- Pipeline-only template files (`prd.md`, `techspec.md`, `tasks.md`).

## [1.6.4] - 2026-04-07

### Changed
- Updated `commit` command to handle JSON payloads in multiple formats for improved compatibility

## [1.6.3] - 2026-04-03

### Fixed
- Fixed `commit` command to validate plan file lists against actual staged files, assign any unassigned staged files to the last commit group, and fall back to a single commit when no plan groups match
- Fixed stdin handling in the Claude Code provider to suppress "no stdin data" CLI warnings and improved `stdout` type safety

## [1.6.2] - 2026-04-02

### Fixed
- Fixed `commit` command truncating diffs that exceed the context limit

## [1.6.1] - 2026-04-02

### Fixed
- Fixed truncated output when running git commands that produce large amounts of data by increasing the internal buffer size

## [1.6.0] - 2026-04-02

### Changed
- Adjusted npm package metadata

## [1.5.0] - 2026-04-02

### Added
- Added fallback path resolution for template lookup
- Added ESLint configuration with TypeScript and React support

### Changed
- Configured CI pipeline to execute tests after the build step

## [1.4.0] - 2026-04-01

### Added
- Added support for multiple provider backends
- Added Claude binary path resolution and validation to the setup flow
- Added language and commit convention selection to configuration setup
- Added grouped file display with descriptions in the commit UI
- Added npm update check notification on CLI startup

### Changed
- Updated default Claude model versions in configuration

### Fixed
- Fixed handling of renamed files in git diff parsing with improved error handling
- Fixed CLI error handling and messages in provider layer
- Fixed bundled templates path resolution
- Fixed provider command execution by removing `shell: true` to improve reliability

## [1.0.0] - 2026-03-26

### Added

- Structured pipeline covering setup through release
- Intelligent model routing (Haiku/Sonnet/Opus) based on task complexity
- Project auto-detection (language, framework, test runner, CI)
- State persistence with file locking
- Customizable templates with `{{variable}}` interpolation
- Git and GitHub integration with Conventional Commits format
- Context modes (normal/light) for different project sizes
- Sensitive file filtering for commits
- Standalone `commit` command with `--push` flag
- `status` command for feature tracking

[0.1.0]: https://github.com/denisvieiradev/gitwise/releases/tag/v0.1.0
[1.0.0]: https://github.com/denisvieiradev/gitwise/releases/tag/v1.0.0
