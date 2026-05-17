---
title: Getting Started
description: Install and set up devflow-cli in your project
---

## Installation

```bash
npm install -g devflow-cli
```

## Prerequisites

- **Node.js** >= 18
- **Git** repository initialized
- **One of the following for LLM access:**
  - **Anthropic API key** set as `ANTHROPIC_API_KEY` environment variable (provider: `claude-code-api-key`)
  - **Claude Code CLI** installed and authenticated with an active Claude subscription (provider: `claude-code-cli`)
- **GitHub CLI** (`gh`) installed and authenticated (for `devflow pr`)

## Quick Start

```bash
# Navigate to your project
cd my-project

# Initialize devflow
devflow init

# Create a PRD from a description
devflow prd "add OAuth authentication with Google and GitHub"

# Generate tech spec from the PRD
devflow techspec 001

# Decompose into implementable tasks
devflow tasks 001

# Execute tasks sequentially with auto-commit
devflow run-tasks 001

# Run tests based on requirements
devflow test 001

# Automated code review
devflow review 001

# Create a pull request
devflow pr 001

# Finalize the feature
devflow done 001
```

## Pipeline Overview

devflow-cli guides you through 9 phases of development:

1. **Init** — Detect project stack and configure
2. **PRD** — Generate product requirements document
3. **Tech Spec** — Generate technical specification
4. **Tasks** — Decompose into implementable tasks
5. **Run Tasks** — Execute tasks with auto-commit
6. **Test** — Generate and run tests
7. **Review** — Automated code review
8. **PR** — Create pull request
9. **Done** — Finalize and clean up

## Configuration

After running `devflow init`, your project will have a `.devflow/config.json` file with settings for:

- LLM provider and model tiers
- Context mode (normal vs light)
- Branch naming pattern
- Templates path
