# Devflow CLI Pivot: Git Flow-Centric Workflows

**Date:** 2026-04-02
**Status:** Draft
**Author:** Denis Vieira + Claude

## Context

Devflow CLI currently focuses on an AI-assisted feature development pipeline (prd → techspec → tasks → run-tasks → test → review → pr → release). The tool is being pivoted to focus on **git workflow management** — helping developers follow git branching strategies (GitFlow, GitHub Flow, GitLab Flow, trunk-based development) with AI-powered assistance for commits, PRs, releases, merges, and worktree management.

**Why:** The current pipeline is too opinionated about the development process. The new direction focuses on what every developer does daily — git operations — and makes them smarter with AI and strategy-aware automation.

**Outcome:** A CLI that understands your team's git branching strategy and automates the right workflow for commits, PRs, releases, merges, and parallel development via worktrees.

---

## Architecture: Strategy Pattern with Flow Engine

### FlowStrategy Interface

A central `FlowStrategy` interface encapsulates the rules for each branching strategy. Every command consults the active strategy to determine branch names, PR targets, merge permissions, and release flows.

```typescript
// src/core/strategies/types.ts

type StrategyName = "gitflow" | "github-flow" | "gitlab-flow" | "trunk-based";
type BranchType = "feature" | "bugfix" | "hotfix" | "release" | "support";
type MergeMethod = "merge" | "squash" | "rebase";

interface ReleaseFlow {
  createBranch: boolean;
  from: string;
  mergeTo: string[];
  tag: boolean;
}

interface ValidationResult {
  valid: boolean;
  message?: string;
}

interface FlowStrategy {
  name: StrategyName;

  // Branch naming & rules
  getBranchName(type: BranchType, name: string): string;
  getBaseBranch(type: BranchType): string;
  getAllowedBranchTypes(): BranchType[];

  // PR behavior
  getPRTarget(sourceBranch: string): string;
  getMergeMethod(): MergeMethod;

  // Release workflow
  getReleaseFlow(): ReleaseFlow;

  // Merge validation
  canMergeTo(source: string, target: string): boolean;
  validateBranch(branch: string): ValidationResult;
}
```

### Strategy Implementations

| Strategy | Main | Integration | Feature Branch | PR Target | Release |
|----------|------|-------------|---------------|-----------|---------|
| **GitFlow** | `main` | `develop` | `feature/{{name}}` | `develop` | Branch `release/x.y.z` → merge to main + develop |
| **GitHub Flow** | `main` | — | `{{name}}` | `main` | Tag on main |
| **GitLab Flow** | `main` | — | `{{name}}` | `main` | Merge main → staging → production |
| **Trunk-based** | `main` | — | `{{name}}` (short-lived) | `main` (squash) | Tag on main |

Each strategy is a separate module in `src/core/strategies/`:
- `gitflow.ts`
- `github-flow.ts`
- `gitlab-flow.ts`
- `trunk-based.ts`
- `factory.ts` — creates the right strategy from config
- `types.ts` — shared interfaces

---

## Commands

### `devflow init`

Setup wizard for new projects. Redesigned to focus on git flow configuration.

**Flow:**
1. Auto-detect project (language, framework, test framework, CI) — reuses existing `scanner.ts`
2. Select git flow strategy (GitFlow, GitHub Flow, GitLab Flow, trunk-based)
3. Configure branch naming pattern (e.g., `feature/{{task_id}}-{{name}}`)
4. Optional: configure task manager integration (Jira, Linear, GitHub Issues, custom regex)
5. Configure AI provider (Claude API key or Claude Code CLI)
6. Configure commit convention (conventional, gitmoji, angular, kernel, custom)
7. Auto-detect git platform from remote URL (GitHub, GitLab, Bitbucket, git-only)
8. Save to `.devflow/config.json`

For GitFlow: also ensures `develop` branch exists (creates if needed).

---

### `devflow commit [--push]`

AI-powered smart commits with visual commit plan.

**Flow:**
1. Check staged files. If nothing staged → interactive staging UI (grouped by status: Added, Modified, Deleted, Renamed)
2. AI analyzes diff and detects if changes span multiple contexts
3. Present **commit plan** with two options:

```
📋 Commit Plan:

  Option A: Split into 2 commits (Recommended)
  ┌─────────────────────────────────────────────┐
  │ 1. feat(auth): add JWT token generation     │
  │    + src/auth/jwt.ts                        │
  │    + src/auth/types.ts                      │
  │    ~ src/config/index.ts                    │
  │                                             │
  │ 2. fix(config): correct database URL parse  │
  │    ~ src/config/db.ts                       │
  └─────────────────────────────────────────────┘

  Option B: Single commit
  ┌─────────────────────────────────────────────┐
  │ feat(auth): add JWT authentication          │
  │                                             │
  │ - Add JWT token generation and validation   │
  │ - Fix database URL parsing for special chars│
  └─────────────────────────────────────────────┘
```

4. User selects plan → execute commits
5. Optional validation: warn if branch doesn't match strategy conventions
6. `--push`: pushes to remote after committing

**AI tier:** Fast (Haiku)

---

### `devflow pr [--base <branch>] [--draft]`

Create PRs with AI-generated descriptions, strategy-aware target branch.

**Flow:**
1. Detect current branch
2. Determine target branch from strategy (`getPRTarget(currentBranch)`)
   - GitFlow: feature/* → develop, release/* → main, hotfix/* → main
   - GitHub Flow / GitLab Flow / Trunk-based: → main
3. `--base <branch>` overrides the strategy default
4. AI analyzes `git diff target...HEAD` + `git log target..HEAD`
5. Generate PR title and description (summary, changes, testing notes)
6. User confirms/edits
7. `--draft` creates as draft PR
8. Detect platform (GitHub → `gh`, GitLab → `glab`, Bitbucket → fallback) and create PR/MR
9. Display PR URL

**AI tier:** Balanced (Sonnet)

---

### `devflow release [<version>] [finish]`

Strategy-aware release lifecycle.

**Behavior per strategy:**

**GitFlow:**
- `devflow release 1.2.0` → creates `release/1.2.0` from `develop`, bumps version, generates changelog
- `devflow release finish` → merges release branch into `main` AND `develop`, creates tag, pushes, creates platform release, deletes release branch

**GitHub Flow:**
- `devflow release 1.2.0` → tags `main`, bumps version, generates changelog, creates GitHub release

**GitLab Flow:**
- `devflow release 1.2.0` → merges `main` → `production`, creates tag, generates release notes

**Trunk-based:**
- `devflow release 1.2.0` → tags `main`, generates changelog

**Common flow:**
1. Determine version (explicit or AI-suggested: major/minor/patch based on commits since last tag)
2. Generate CHANGELOG entries (AI-powered, from commit history)
3. Generate user-facing release notes (multi-language support retained)
4. Execute strategy-specific branch/merge/tag operations
5. Create platform release if available (GitHub, GitLab)

**AI tier:** Balanced (Sonnet)

---

### `devflow merge [<branch>] [--from <src> --to <dst>]`

Merge branches with strategy validation and AI-powered conflict resolution.

**Usage:**
- `devflow merge develop` — merge `develop` into current branch
- `devflow merge --from release/1.0 --to main` — explicit source → target merge

**Flow:**
1. Determine source and target branches
2. Validate merge is allowed by strategy (`canMergeTo(source, target)`)
   - GitFlow: blocks `feature/*` → `main` (must go through `develop`)
   - Other strategies: more permissive
3. If blocked: show error with correct alternative
4. Execute `git merge`
5. If conflicts detected:
   - AI analyzes both sides of each conflict
   - For each conflicted file: shows "your change" vs "their change" and AI suggestion
   - User can accept AI suggestion, manual resolve, or abort
6. Complete merge and commit

**AI tier:** Powerful (Opus) for conflict resolution, no AI when no conflicts

---

### `devflow worktree <create|list|remove> [name]`

Manage git worktrees for parallel development.

**`devflow worktree create [name] [--task <id>] [--type <branch-type>]`**

1. If `name` is omitted: AI-assisted branch naming
   - Ask user to describe the work
   - AI generates 2-3 branch name suggestions following configured pattern + task ID
   - User selects or types custom
2. If `name` is provided: use directly
3. `--task <id>` includes task ID in branch name
4. `--type` sets branch type (feature, bugfix, hotfix — default: feature)
5. Determine branch name from strategy (`getBranchName(type, name)`)
6. Determine base branch from strategy (`getBaseBranch(type)`)
7. Execute `git worktree add <path> -b <branch> <base>`
8. Display path and tip about compozy:
   ```
   💡 Tip: Use compozy for AI-assisted development in this worktree:
      cd <path> && compozy start
      https://github.com/compozy/compozy
   ```

**`devflow worktree list`**

Shows table: name, branch, path, status (clean/dirty).

**`devflow worktree remove <name> [--force]`**

1. Remove worktree
2. Ask if branch should be deleted too (checks if merged first)
3. `--force` skips confirmation

**AI tier:** Fast (Haiku) for branch name suggestions only, no AI otherwise

---

## Configuration

### `.devflow/config.json` (new schema)

```json
{
  "strategy": "gitflow",
  "branches": {
    "main": "main",
    "develop": "develop",
    "pattern": "feature/{{task_id}}-{{name}}"
  },
  "taskManager": {
    "enabled": true,
    "type": "jira",
    "pattern": "PROJ-\\d+"
  },
  "provider": "claude-code-api-key",
  "models": {
    "fast": "claude-haiku-4-5-20251001",
    "balanced": "claude-sonnet-4-5-20250929",
    "powerful": "claude-opus-4-5-20250929"
  },
  "language": "en",
  "commitConvention": "conventional",
  "platform": "github",
  "contextMode": "normal",
  "project": {
    "name": "my-project",
    "language": "typescript",
    "framework": "react",
    "testFramework": "jest",
    "hasCI": true
  }
}
```

### Platform detection

Auto-detected from `git remote get-url origin`:
- `github.com` → GitHub (`gh` CLI)
- `gitlab.com` or self-hosted GitLab → GitLab (`glab` CLI)
- `bitbucket.org` → Bitbucket (git-only fallback)
- Other → git-only (no PR/release platform features)

---

## Code Structure

### New files

```
src/core/strategies/
├── types.ts           # FlowStrategy interface, types
├── factory.ts         # createStrategy(config) → FlowStrategy
├── gitflow.ts         # GitFlow implementation
├── github-flow.ts     # GitHub Flow implementation
├── gitlab-flow.ts     # GitLab Flow implementation
└── trunk-based.ts     # Trunk-based implementation

src/cli/commands/
├── merge.ts           # NEW: merge command
└── worktree.ts        # NEW: worktree command

src/infra/
├── gitlab.ts          # NEW: GitLab CLI integration
└── platform.ts        # NEW: platform detection
```

### Modified files

```
src/cli/program.ts       # Redesign: register new commands only
src/cli/commands/init.ts  # Redesign: strategy selection flow
src/cli/commands/commit.ts # Evolve: visual commit plan
src/cli/commands/pr.ts    # Evolve: strategy-aware, platform detection
src/cli/commands/release.ts # Redesign: strategy-aware lifecycle
src/core/types.ts         # Redesign: new types
src/core/config.ts        # Evolve: new config schema
src/infra/git.ts          # Expand: worktree ops, merge, conflict detection
src/providers/model-router.ts # Update: new command routing
```

### Removed files

```
src/cli/commands/prd.ts
src/cli/commands/techspec.ts
src/cli/commands/tasks.ts
src/cli/commands/run-tasks.ts
src/cli/commands/test.ts
src/cli/commands/review.ts
src/cli/commands/done.ts
src/cli/commands/status.ts
src/cli/context.ts
src/core/state.ts
src/core/pipeline.ts
src/core/context.ts
src/core/drift.ts
templates/prd.md
templates/techspec.md
templates/tasks.md
```

### Kept as-is

```
src/providers/          # Entire provider layer (claude.ts, claude-code.ts, factory.ts)
src/core/template.ts    # Template interpolation
src/core/scanner.ts     # Project auto-detection
src/infra/github.ts     # GitHub CLI integration
src/infra/filesystem.ts
src/infra/env.ts
src/infra/logger.ts
src/infra/update-check.ts
templates/commit.md
templates/pr.md
templates/release-*.md
```

---

## Model Routing

| Command | Tier | Justification |
|---------|------|--------------|
| `init` | Fast (Haiku) | Simple detection and setup |
| `commit` | Fast (Haiku) | Diff analysis, message generation |
| `pr` | Balanced (Sonnet) | Rich PR description generation |
| `release` | Balanced (Sonnet) | Changelog, release notes |
| `merge` (conflicts) | Powerful (Opus) | Deep analysis for conflict resolution |
| `merge` (no conflicts) | — | No AI, git operations only |
| `worktree` (name suggestion) | Fast (Haiku) | Simple name generation |
| `worktree` (other) | — | No AI, git operations only |

---

## Roadmap (Post-v1)

- **`devflow qa`** — User provides acceptance criteria, AI opens browser (Playwright) and performs automated functional testing against the running application
- **Bitbucket integration** — Native Bitbucket CLI support
- **Custom strategies** — User-defined strategies via YAML configuration
- **Branch protection validation** — Check if target branch has protection rules before merge/PR
- **Auto-reviewer suggestion** — Suggest PR reviewers based on git blame of modified files

---

## Verification Plan

### Unit tests
- Each strategy implementation: branch naming, PR targets, merge validation, release flow
- Strategy factory: correct strategy from config
- Config parsing: new schema validation
- Platform detection: URL patterns

### Integration tests
- `init` command: full setup flow with strategy selection
- `commit` command: multi-context detection and commit plan
- `worktree` commands: create/list/remove lifecycle
- `merge` command: validation and conflict detection
- `release` command: strategy-specific flows

### Manual testing
1. Run `devflow init` and configure each strategy
2. Create worktree, make changes, commit with plan view
3. Create PR and verify target branch matches strategy
4. Test merge with intentional conflict to verify AI resolution
5. Run release flow for each strategy
6. Verify platform detection with GitHub and GitLab remotes
