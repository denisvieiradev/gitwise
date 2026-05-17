# Migrating from `devflow-cli` to `gitwise`

`devflow-cli` has been refactored and renamed to `gitwise` — a focused **AI git toolbelt** with four orthogonal commands. The full pipeline surface (PRD → techspec → tasks → run-tasks → test → done → status, plus `init`) has been **removed**.

If you were using `devflow-cli` primarily for `commit`, `review`, `pr`, or `release`, switching to `gitwise` is a straight-across rename — see the **Direct equivalents** table. If you were using the pipeline commands, see **Removed commands** for what is gone and why.

## Install the replacement

```bash
npm uninstall -g @denisvieiradev/devflow-cli
npm install -g @denisvieiradev/gitwise
gw --help
```

The binary changed: `devflow …` → `gw …`. The npm package changed: `@denisvieiradev/devflow-cli` → `@denisvieiradev/gitwise`.

## Direct equivalents

These commands map across with no behavioral loss.

| `devflow-cli` | `gitwise` | Notes |
|---|---|---|
| `devflow commit` | `gw commit` | Multi-context commit splitting unchanged. Same conventional-commits output, same sensitive-file filter. |
| `devflow commit --push` | `gw commit --push` | Identical. |
| `devflow review` | `gw review` | Review is no longer coupled to a techspec; it operates on the current branch's diff vs. base only. `--json` available for scripting. |
| `devflow pr` | `gw pr` | Same auto-drafted title + body. New: `--update` refreshes the body when a PR already exists on the branch. |
| `devflow release` | `gw release` | Same semver bump + Keep-a-Changelog + release notes flow. Localized notes (PT / ES / FR) preserved. |

The free-form intent argument is new everywhere: `gw commit "drop the unused imports"`, `gw pr "explain the migration shape"`, etc. It is always optional.

## Removed commands

These commands are gone and **not** coming back in MVP. The "Why" column explains the rationale captured in the PRD's Non-Goals and ADR-001.

| `devflow-cli` | Replacement | Why |
|---|---|---|
| `devflow init` | _(none — no setup required)_ | `gitwise` has no required initialization. The first `gw` invocation prompts once for a provider (Claude Code subprocess or Anthropic API) and writes `~/.gitwise/config.json`. There is no per-repo `.gitwise/` directory created by tooling. |
| `devflow prd <description>` | _(none — outside scope)_ | Pipeline command. `gitwise` is positioned as an AI git toolbelt, not a planning pipeline. Use a separate planning tool of your choice (or your own notes) for PRD authoring. |
| `devflow techspec [ref]` | _(none — outside scope)_ | Pipeline command. Same reasoning as `prd`. |
| `devflow tasks [ref]` | _(none — outside scope)_ | Pipeline command. Same reasoning as `prd`. |
| `devflow run-tasks [ref]` | _(none — outside scope)_ | Pipeline command. Auto-implementation of pipeline tasks is no longer part of the product. |
| `devflow test [ref]` | _(none — outside scope)_ | Pipeline command. Test plan generation was tied to the pipeline state machine. |
| `devflow done [ref]` | _(none — outside scope)_ | Pipeline command. Without `state.json` there is nothing to "finalize". |
| `devflow status` | _(none — outside scope)_ | Pipeline command. There is no per-feature progress to track because there are no features. Use `git status`, `git log`, and `gh pr status` for the actual git/PR state. |

### Why this break?

`devflow-cli` tried to own the entire idea-to-merge pipeline. That coupling created real costs: required `init`, persistent `.devflow/state.json`, SHA-based drift detection across artifacts, and a state machine users had to keep in their heads. The pivot to `gitwise` keeps the pieces that were genuinely high-value (multi-context commit splitting, AI-drafted PRs, AI review, semver-aware releases) and drops the pieces that prescribed a workflow.

See [ADR-001](../.compozy/tasks/refactor-idea/adrs/adr-001.md) for the full decision context.

## Config migration

`devflow-cli` stored config in `.devflow/config.json` (per-repo). `gitwise` splits config into:

- `~/.gitwise/config.json` (user-global) — provider, models, language, default base branch, commit convention.
- `<repo>/.gitwise.json` (optional, per-repo override) — same fields, deep-merged on top of the user config.
- `~/.gitwise/.env` (single line, `0600`) — `ANTHROPIC_API_KEY=...`. Never written into `config.json`.

There is **no automated migration** from `.devflow/` to `~/.gitwise/`. The schemas are similar enough that you can copy fields by hand:

- `provider` — `"claude"` → `"api"`; `"claude-code"` stays.
- `models` — same keys (`fast`, `balanced`, `powerful`); update IDs to whichever Claude versions you want pinned.
- `language` — same (`en` / `pt` / `es` / `fr`).
- `commitConvention` — same (`conventional` / `free`).

Pipeline-only fields (`branchPattern`, `contextMode`, `project.*`) have no analogue and can be dropped.

## What about my existing `.devflow/` directory?

`gitwise` ignores `.devflow/` entirely. You can leave it in place, delete it, or move it to a backup if you want a record of the PRDs and techspecs you previously generated. `gitwise` will not read or write to it.

## Templates

If you had custom templates under `.devflow/templates/`:

- `commit.md`, `pr.md`, `release-version.md`, `release-changelog.md`, `release-notes.md` — move to `<repo>/.gitwise/templates/` (per-repo) or `~/.gitwise/templates/` (user-global). They will be picked up by the same regex `{{variable}}` interpolation.
- `prd.md`, `techspec.md`, `tasks.md` — no replacement. The corresponding commands are gone.
- A new `review.md` template is supported in `gitwise`; the previous `devflow review` had its prompt inlined in code.

## Reporting bugs

File issues on the new repository: <https://github.com/denisvieiradev/gitwise> (replacing the archived `devflow-cli` issue tracker).

## Further reading

- [PRD: gitwise — AI Git Toolbelt](../.compozy/tasks/refactor-idea/_prd.md)
- [TechSpec: gitwise — Refactor from devflow-cli](../.compozy/tasks/refactor-idea/_techspec.md)
- [Deprecation banner text for the final `devflow-cli` release](deprecation-banner.md)
