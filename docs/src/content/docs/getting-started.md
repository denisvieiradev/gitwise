---
title: Getting Started
description: Install and set up gitwise in your project
---

## Installation

```bash
npm install -g @denisvieiradev/gitwise
```

## Prerequisites

- **Node.js** >= 18
- **Git** repository initialized
- **One of the following for LLM access:**
  - **Anthropic API key** set as `ANTHROPIC_API_KEY` environment variable (provider: `api`)
  - **Claude Code CLI** installed and authenticated with an active Claude subscription (provider: `claude-code`)
  - **Codex CLI** installed and authenticated with your OpenAI account (provider: `codex`)
  - **Copilot CLI** installed and authenticated with your GitHub Copilot subscription (provider: `copilot`)
  - **Kiro CLI** installed and authenticated with your Kiro account (provider: `kiro`)

  Run `gw provider` to see which of these are installed and choose one. Switch any time with the same command.
- **GitHub CLI** (`gh`) installed and authenticated (for `gw pr`)

## Quick Start

```bash
# Navigate to your project
cd my-project

# Stage changes and generate a commit
git add .
gw commit

# Run an AI-powered review against main
gw review

# Draft and create a pull request
gw pr

# Cut a versioned release
gw release
```

## Commands

gitwise ships seven top-level commands:

1. **commit** — Generate conventional commit messages from staged changes
2. **review** — AI-powered code review against the base branch
3. **pr** — Draft and create/update a GitHub pull request
4. **release** — Cut a versioned release with changelog and notes
5. **config** — Get or set gitwise configuration
6. **provider** — Choose which AI provider gitwise uses
7. **skills** — Install gitwise's commands for Codex, Kiro, or Copilot into your project

## Configuration

On first run, gitwise detects the supported AI CLIs on your machine and asks which to use; if none is installed it prompts for an Anthropic API key and stores it at `~/.gitwise/.env`. User-level settings live at `~/.gitwise/config.json`. Per-repo overrides can be placed in `<repo>/.gitwise.json` — see the [Configuration](/configuration/) page.

## Use gitwise inside Codex, Kiro, or Copilot

`gw skills install <tool>` copies gitwise's commands into your own project so the tool's agent can run them. Run it from the project's git root:

```bash
gw skills install codex     # .agents/skills/gitwise-*/SKILL.md
gw skills install kiro      # .kiro/skills/gitwise-*/SKILL.md
gw skills install copilot   # .github/instructions/gitwise.instructions.md
```

Prerequisite: the installed skills run scripts from `@denisvieiradev/gitwise-skills`, so add it to the project where you install them:

```bash
npm install --save-dev @denisvieiradev/gitwise-skills
```

Only `gitwise-*` paths (and the single `gitwise.instructions.md` file) are created or overwritten. Your other skills and instructions, including an existing `.github/copilot-instructions.md`, are never touched.

## Updating

- **The `gw` CLI:** `npm install -g @denisvieiradev/gitwise@latest`
- **The Claude Code plugin:** Claude Code updates installed plugins from the marketplace. To refresh right away, run `/plugin marketplace update gitwise` inside Claude Code and reload. This is Claude Code's own mechanism; gitwise adds nothing to it.
- **Codex, Kiro, or Copilot skills:** after upgrading `gw` (and `@denisvieiradev/gitwise-skills` in your project), re-run `gw skills install <tool>`. It overwrites the gitwise-managed files with the current version.
