# `@denisvieiradev/gitwise`

The `gw` CLI: AI-powered git toolbelt. Installs the `gw` binary, which wraps the non-interactive commands from [`@denisvieiradev/gitwise-core`](https://www.npmjs.com/package/@denisvieiradev/gitwise-core) with an interactive prompt layer (`@clack/prompts`).

## Install

```bash
npm install -g @denisvieiradev/gitwise
gw --help
```

The first run checks for an installed Claude Code binary and uses it as the LLM provider; otherwise `gw` prompts for `ANTHROPIC_API_KEY`.

## Commands

Straight from `gw --help`:

| Command | Description |
|---|---|
| `gw commit [intent]` | Generate intelligent commit message from staged changes |
| `gw review [intent]` | AI-powered code review of staged/branch changes |
| `gw pr [intent]` | AI-drafted pull request — create or update a GitHub PR |
| `gw release` | Versioned release with changelog and release notes |
| `gw release prepare [version]` | Plan a release and persist `.gitwise/release-plan.json` (no tag, no push) |
| `gw release finish` | Apply the persisted release plan: bump, commit, merge, tag, push |
| `gw release abort` | Discard the persisted release plan (optionally delete the release branch) |
| `gw config` | Get or set gitwise configuration |

Run `gw <command> --help` for the full flag list on any command.

## Full documentation

Configuration schema, privacy/data-handling details, the release lifecycle, and the Claude Code plugin surface are documented in the [project README](https://github.com/denisvieiradev/gitwise#readme).

## License

[MIT](https://github.com/denisvieiradev/gitwise/blob/main/LICENSE)
