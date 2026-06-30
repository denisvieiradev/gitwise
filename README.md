# gitwise

**Ship cleaner commits, reviews, PRs, and releases — with AI.** `gitwise` is an AI-powered git assistant that covers the full pre-ship surface: smart commits (with multi-context splitting), pre-push review, drafted pull requests, and versioned releases.

[![CI](https://github.com/denisvieiradev/gitwise/actions/workflows/ci.yml/badge.svg)](https://github.com/denisvieiradev/gitwise/actions/workflows/ci.yml)
[![CodeQL](https://github.com/denisvieiradev/gitwise/actions/workflows/codeql.yml/badge.svg)](https://github.com/denisvieiradev/gitwise/actions/workflows/codeql.yml)
[![OSV-Scanner](https://github.com/denisvieiradev/gitwise/actions/workflows/osv-scanner.yml/badge.svg)](https://github.com/denisvieiradev/gitwise/actions/workflows/osv-scanner.yml)
[![npm provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)
[![npm version](https://img.shields.io/npm/v/%40denisvieiradev%2Fgitwise)](https://www.npmjs.com/package/@denisvieiradev/gitwise)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)

> **Coming from `devflow-cli`?** The pipeline parts (`prd`, `techspec`, `tasks`, `run-tasks`, `test`, `done`, `status`, `init`) have been removed. See [`docs/migrating-from-devflow.md`](docs/migrating-from-devflow.md) for the full mapping.

---

## Positioning

`gitwise` is a focused **AI git toolbelt** — four orthogonal commands, no required workflow, no persistent state. It ships in two equally-supported install modes:

- **CLI** — `gw` binary, installable globally with `npm`.
- **Claude Code plugin** — discoverable skills (`gitwise:commit`, `gitwise:review`, `gitwise:pr`, `gitwise:release`) that live inside Claude Code.

Both surfaces share one source of truth in `@denisvieiradev/gitwise-core` and produce identical outputs from identical inputs.

## Install

### CLI

```bash
npm install -g @denisvieiradev/gitwise
gw --help
```

The first time you run a command, `gw` checks for an installed Claude Code binary and uses it as the LLM provider. If Claude Code is not available, `gw` prompts for `ANTHROPIC_API_KEY` (read from the environment or stored in `~/.gitwise/.env`).

### Claude Code plugin

Add the marketplace and install the plugin from inside Claude Code:

```text
/plugin marketplace add denisvieiradev/gitwise
/plugin install gitwise@gitwise
```

Once installed, four skills become available in the conversation:

- `gitwise:commit`
- `gitwise:review`
- `gitwise:pr`
- `gitwise:release`

Skills inherit Claude Code's auth; no API key prompt.

## Commands

Five orthogonal commands. Each works standalone — no `init`, no persistent state.

| Command | Description |
|---|---|
| `gw commit [intent]` | Generates a Conventional Commits message for the staged diff. Detects whether the diff is a single logical change or **multiple contexts**; if multiple, offers an interactive commit-split plan. `--push` commits and pushes in one step. |
| `gw review [intent]` | AI review of the current branch vs. base. Findings categorized as **Critical / Suggestions / Nitpicks**. `--json` for scripting. |
| `gw pr [intent]` | Drafts a PR title + body from the branch commits. Opens the PR via `gh` if installed; otherwise prints title + body for manual creation. `--update` refreshes an existing PR. |
| `gw release` | Inspects commits since the last tag, recommends a semver bump, updates `CHANGELOG.md`, writes release notes (English default; PT / ES / FR available), bumps `package.json`, tags, pushes, and creates a GitHub release via `gh` when available. |
| `gw issue "<description>"` | Drafts a structured issue title + body from a free-text description, detecting bug report vs. feature request. Creates the issue via `gh` with `--apply`; `--label` and `--assignee` attach metadata. |

Every LLM call prints input/output token counts after the operation. The model tier (`fast` / `balanced` / `powerful`) is routed per-command and configurable per repo.

## Release lifecycle

`gw release` splits into a two-phase lifecycle so you can review (or edit) the generated changelog and notes before tagging and pushing. The one-shot `gw release` invocation keeps today's UX and runs both phases in a single process.

```bash
gw release prepare              # plan + (gitflow) create release branch; stops before tagging
gw release prepare 1.2.0        # pin the version explicitly
gw release prepare --bump minor # override the LLM-suggested bump
gw release finish               # apply the saved plan: bump, commit, merge, tag, push
gw release finish --no-delete-branch # keep the release branch after merging (gitflow only)
gw release abort                # discard the saved plan (asks before deleting the branch)
```

Between `prepare` and `finish`/`abort`, the plan is persisted at `.gitwise/release-plan.json`. The file is short-lived (deleted by `finish` or `abort`), and `prepare` appends it to `.gitignore` automatically so it never leaks into commits. Edit `.gitwise/release-<version>.md` between phases to tune the notes — `finish` re-reads that file from disk, not the in-memory plan.

See [ADR-001](.compozy/tasks/release-prepare/adrs/adr-001.md) for the rationale behind splitting `prepare` and `finish`, and [ADR-003](.compozy/tasks/release-prepare/adrs/adr-003.md) for the plan-file lifecycle and integrity checks.

### GitFlow opt-in

The lifecycle defaults to GitHub-flow (single trunk, tag on `main`). GitFlow is opt-in via `RepoConfig` in `<repo>/.gitwise.json`:

```jsonc
{
  "releaseStrategy": "gitflow",   // "github-flow" (default) | "gitflow"
  "developBranch": "develop"      // optional; defaults to "develop"; gitflow only
}
```

With `gitflow`, `prepare` creates a `release/<version>` branch and bumps `package.json` + writes the changelog entry on that branch; `finish` merges the release branch into both the main branch and the develop branch, tags, pushes, and (unless `--no-delete-branch` is passed) deletes the release branch.

See [ADR-002](.compozy/tasks/release-prepare/adrs/adr-002.md) for why the strategy abstraction is scoped to release behavior only. Merge conflicts during `finish` are surfaced as plain errors — gitwise does not attempt automated conflict resolution.

## Privacy

**Diffs are sent to Claude** (via the Anthropic API or your local Claude Code subprocess) for processing. There is no other telemetry; no usage data leaves your machine except the LLM calls themselves.

- **Sensitive-file filter is on by default.** Files matching `.env`, `*.pem`, credential JSONs, and similar patterns are refused for staging and never included in an LLM call.
- **API keys** are persisted in `~/.gitwise/.env` with `0600` permissions and are never written into `config.json`.
- The Claude Code provider runs entirely on your machine through the `claude` binary; the Anthropic API provider sends requests directly to Anthropic.

When you need stricter isolation, set `provider = "claude-code"` in `~/.gitwise/config.json` to keep all calls inside your local Claude Code session.

## Configuration

`gitwise` reads two config files. Both are optional and deep-merged: per-repo overrides win over user-global, which wins over built-in defaults.

### `~/.gitwise/config.json` — `UserConfig`

```jsonc
{
  "provider": "claude-code",                 // "claude-code" | "api"
  "claudeCliPath": "/usr/local/bin/claude",  // optional, when provider = "claude-code"
  "models": {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-6",
    "powerful": "claude-opus-4-7"
  },
  "language": "en",                          // "en" | "pt" | "es" | "fr"
  "defaultBaseBranch": "main",
  "commitConvention": "conventional"         // "conventional" | "free"
}
```

API keys live separately in `~/.gitwise/.env` (single line, `0600`):

```
ANTHROPIC_API_KEY=sk-ant-...
```

### `<repo>/.gitwise.json` — `RepoConfig`

All fields optional; only override what you need. Useful for repo-specific commit conventions, language, or custom templates.

```jsonc
{
  "models": { "balanced": "claude-sonnet-4-6" },
  "language": "pt",
  "defaultBaseBranch": "develop",
  "commitConvention": "conventional",
  "templatesPath": ".gitwise/templates"       // optional override directory
}
```

Detailed schema reference (full TypeScript types, default values, validation rules) ships with the `@denisvieiradev/gitwise-core` package and is reproduced in [`docs/src/content/docs/configuration.md`](docs/src/content/docs/configuration.md).

### Templates

Prompt templates are loaded with three-level precedence: per-repo (`<repo>/.gitwise/templates/`) > user-global (`~/.gitwise/templates/`) > built-in (`@denisvieiradev/gitwise-core/templates/`). Override any of `commit.md`, `review.md`, `pr.md`, `release-*.md` to customize behavior; the existing `{{variable}}` regex interpolation is unchanged.

## Requirements

| Requirement | Purpose |
|---|---|
| [Node.js](https://nodejs.org) >= 18 | Runtime |
| [Git](https://git-scm.com) | Always required |
| [Claude Code](https://docs.claude.com/en/claude-code) **or** `ANTHROPIC_API_KEY` | LLM access |
| [GitHub CLI (`gh`)](https://cli.github.com) | Optional — needed only for `gw pr` create and `gw release` GitHub releases |

Cross-platform: macOS, Linux, Windows.

## Architecture

`gitwise` is a TypeScript / Node ≥ 18 npm-workspaces monorepo with three publishable packages:

- [`@denisvieiradev/gitwise-core`](packages/core) — shared logic (commands, providers, git/github, config, templates).
- `@denisvieiradev/gitwise` (`packages/cli/`) — the `gw` CLI. _(landed in a later refactor task.)_
- `@denisvieiradev/gitwise-skills` (`packages/skills/`) — the Claude Code plugin (manifest + skill markdown + thin scripts). _(landed in a later refactor task.)_

The four product commands live in `core` as **non-interactive async functions** returning typed plans/drafts. The CLI wraps them with `@clack/prompts`; the skills bundle calls them from small Node scripts and emits markdown for Claude Code to drive the dialog.

### PRD & ADRs

- [PRD: gitwise — AI Git Toolbelt](.compozy/tasks/refactor-idea/_prd.md)
- [TechSpec: gitwise](.compozy/tasks/refactor-idea/_techspec.md)
- [ADR-001: Four-command AI git toolbelt](.compozy/tasks/refactor-idea/adrs/adr-001.md)
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](.compozy/tasks/refactor-idea/adrs/adr-002.md)
- [ADR-003: Non-interactive core with four high-level command functions](.compozy/tasks/refactor-idea/adrs/adr-003.md)
- [ADR-004: Explicit first-run provider choice with persisted user config](.compozy/tasks/refactor-idea/adrs/adr-004.md)
- [ADR-005: Locked-version monorepo releases via dogfooded `gw release`](.compozy/tasks/refactor-idea/adrs/adr-005.md)

## Local Development

Building and running `gitwise` from source — for contributors or anyone who wants to try unreleased changes.

```bash
# 1. Clone and install
git clone https://github.com/denisvieiradev/gitwise.git
cd gitwise
npm install

# 2. Build every workspace (core, cli, skills) via tsup
npm run build

# 3. Run the CLI directly from the built output
node packages/cli/dist/index.js --help

# Or link the workspace globally so `gw` resolves to your local build
npm link -w @denisvieiradev/gitwise
gw --help
```

Useful variants:

```bash
npm run build -w @denisvieiradev/gitwise-core   # build a single workspace
npm run typecheck                               # tsc --noEmit across workspaces
npm test                                        # jest across workspaces
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full development workflow, repository layout, and release runbook.

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, repository layout, the per-release runbook, and development workflow.

## Security

`gitwise` is designed with security as a first-class concern. Every release is signed and attested — see [Supply Chain](#supply-chain) for verification details.

- **Vulnerability reports**: use the private reporting path in [`SECURITY.md`](SECURITY.md) — do not open a public issue.
- **Day-to-day posture**: API key handling, sensitive-file filter, and no-telemetry guarantees are in the [Privacy](#privacy) section above.
- **Conduct concerns**: see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for the reporting process.

## Supply Chain

Every `gitwise` release publishes three independently verifiable supply-chain artifacts: npm provenance (via Sigstore), a GPG-signed git tag, and a CycloneDX 1.5 SBOM. Full verification procedures are in [`docs/src/content/docs/supply-chain.md`](docs/src/content/docs/supply-chain.md).

**Quick provenance check:**

```sh
npm view @denisvieiradev/gitwise --json | jq .dist.attestations
```

The maintainer's GPG public key is at [`KEYS.asc`](KEYS.asc). Import it with `gpg --import KEYS.asc` and run `git tag -v v<version>` to verify a signed release tag.

## Governance

`gitwise` operates under a **Benevolent Dictator For Life (BDFL)** model. Denis Vieira holds final decision-making authority. The full decision process, response SLAs, and path to co-maintainership are in [`GOVERNANCE.md`](GOVERNANCE.md).

Community behavior is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1). Review requests are automatically routed to the maintainer via `.github/CODEOWNERS`.

## Exit Codes

`gw` terminates with a stable, machine-readable exit code on every invocation. The full contract — code table, category ranges, and shell-scripting examples — is in [`docs/src/content/docs/exit-codes.md`](docs/src/content/docs/exit-codes.md).

For richer automation, pass `--json` to receive a structured `{ "error": { "code", "message", "exitCode", "details?" } }` envelope on stdout alongside the numeric exit code.

## Reporting Issues

Open a [GitHub Issue](https://github.com/denisvieiradev/gitwise/issues) to report a bug, request a feature, or ask a question. Review requests are automatically routed to the maintainer via `.github/CODEOWNERS` — no manual assignment needed.

For security vulnerabilities, follow the private reporting path in [`SECURITY.md`](SECURITY.md) instead.

## Support the developer

If `gitwise` is useful to you, consider supporting development:

- [Buy me a coffee](https://buymeacoffee.com/denisvieiradev)
- **PIX (Brazil):** `denisvieira05@gmail.com`

## License

[MIT](LICENSE)

---

Built by [Denis Vieira](https://github.com/denisvieiradev)
