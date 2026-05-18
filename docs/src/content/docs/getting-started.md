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

gitwise ships five top-level commands:

1. **commit** — Generate conventional commit messages from staged changes
2. **review** — AI-powered code review against the base branch
3. **pr** — Draft and create/update a GitHub pull request
4. **release** — Cut a versioned release with changelog and notes
5. **config** — Get or set gitwise configuration

## Configuration

On first run, gitwise will prompt for an Anthropic API key and store it at `~/.gitwise/.env`. User-level settings live at `~/.gitwise/config.json`. Per-repo overrides can be placed in `<repo>/.gitwise.json` — see the [Configuration](/configuration/) page.
