# gitwise

**Ship cleaner commits, reviews, PRs, and releases — with AI.** `gitwise` is an AI-powered git assistant that covers the full pre-ship surface: smart commits (with multi-context splitting), pre-push review, drafted pull requests, and versioned releases.

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

Install the `gitwise` plugin from the Claude Code plugin marketplace, or via Claude Code's discover-plugins flow. Once installed, four skills become available in the conversation:

- `gitwise:commit`
- `gitwise:review`
- `gitwise:pr`
- `gitwise:release`

Skills inherit Claude Code's auth; no API key prompt.

## Commands

Four orthogonal commands. Each works standalone — no `init`, no persistent state.

| Command | Description |
|---|---|
| `gw commit [intent]` | Generates a Conventional Commits message for the staged diff. Detects whether the diff is a single logical change or **multiple contexts**; if multiple, offers an interactive commit-split plan. `--push` commits and pushes in one step. |
| `gw review [intent]` | AI review of the current branch vs. base. Findings categorized as **Critical / Suggestions / Nitpicks**. `--json` for scripting. |
| `gw pr [intent]` | Drafts a PR title + body from the branch commits. Opens the PR via `gh` if installed; otherwise prints title + body for manual creation. `--update` refreshes an existing PR. |
| `gw release` | Inspects commits since the last tag, recommends a semver bump, updates `CHANGELOG.md`, writes release notes (English default; PT / ES / FR available), bumps `package.json`, tags, pushes, and creates a GitHub release via `gh` when available. |

Every LLM call prints input/output token counts after the operation. The model tier (`fast` / `balanced` / `powerful`) is routed per-command and configurable per repo.

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
- [TechSpec: gitwise — Refactor from devflow-cli](.compozy/tasks/refactor-idea/_techspec.md)
- [ADR-001: Four-command AI git toolbelt](.compozy/tasks/refactor-idea/adrs/adr-001.md)
- [ADR-002: Monorepo with npm workspaces (core / cli / skills)](.compozy/tasks/refactor-idea/adrs/adr-002.md)
- [ADR-003: Non-interactive core with four high-level command functions](.compozy/tasks/refactor-idea/adrs/adr-003.md)
- [ADR-004: Explicit first-run provider choice with persisted user config](.compozy/tasks/refactor-idea/adrs/adr-004.md)
- [ADR-005: Locked-version monorepo releases via dogfooded `gw release`](.compozy/tasks/refactor-idea/adrs/adr-005.md)

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, repository layout, the per-release runbook, and development workflow.

## Security

To report a vulnerability, see [`SECURITY.md`](SECURITY.md). For day-to-day security posture, see the [Privacy](#privacy) section above.

## Support the developer

If `gitwise` is useful to you, consider supporting development:

- [Buy me a coffee](https://buymeacoffee.com/denisvieiradev)
- **PIX (Brazil):** `denisvieira05@gmail.com`

## License

[MIT](LICENSE)

---

Built by [Denis Vieira](https://github.com/denisvieiradev)
