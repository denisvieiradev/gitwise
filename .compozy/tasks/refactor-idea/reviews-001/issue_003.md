---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: package.json
line: 33
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Repository, bugs, and homepage URLs still point to devflow-cli

## Review Comment

The root `package.json:33-40` and `packages/core/package.json:43-51` still declare:

```json
"repository": { "url": "git+https://github.com/denisvieiradev/devflow-cli.git" },
"bugs": { "url": "https://github.com/denisvieiradev/devflow-cli/issues" },
"homepage": "https://github.com/denisvieiradev/devflow-cli#readme"
```

These fields are surfaced verbatim on the npm registry page for every published package and in `npm bug` / `npm repo` CLI commands. After publish, users clicking "Repository" on `@denisvieiradev/gitwise-core` will land on the archived (or about-to-be-archived per PRD risk mitigation) devflow-cli repository. The PRD calls for a clean break with the new package name — surface metadata should match.

Affected files (verify all):
- `package.json:33-40`
- `packages/core/package.json:43-51`
- `packages/cli/package.json` (verify)
- `packages/skills/package.json` (verify)

**Suggested fix**: Replace every devflow-cli URL with the gitwise repository URL (e.g., `https://github.com/denisvieiradev/gitwise.git`) once the new repo is created, or with a placeholder/temporary URL marked TODO until the rename lands. Do not publish until these are correct.

## Triage

- Decision: `VALID`
- Root cause: When the project was renamed from `devflow-cli` to `gitwise`, the `repository.url`, `bugs.url`, and `homepage` fields in the root and `packages/core` package.json were not updated. These fields are surfaced verbatim on the npm registry page for every published package and by `npm bug` / `npm repo`, so publishing `@denisvieiradev/gitwise-core` would direct users to the (about-to-be-archived) `devflow-cli` repo. The git remote is already `denisvieiradev/gitwise.git`, confirming `https://github.com/denisvieiradev/gitwise` as the canonical URL.
- Fix:
  - `package.json` (root, lines 30-37): replaced `denisvieiradev/devflow-cli` with `denisvieiradev/gitwise` in `repository.url`, `bugs.url`, and `homepage`.
  - `packages/core/package.json` (lines 43-51): same replacement; preserved the `directory: "packages/core"` field so the npm registry can deep-link into the monorepo subtree.
- Scope note: `packages/core/package.json` is not in `<batch_scope>` code files, but issue 003 explicitly lists it as an affected file and core is the published package whose npm page surfaces these URLs. Limiting the fix to the root would leave the issue's primary user-visible impact (npm "Repository" link on `@denisvieiradev/gitwise-core`) unaddressed, so the touch was kept minimal — three URL strings only.
- Verified out of scope:
  - `packages/cli/package.json` and `packages/skills/package.json` do not declare `repository`/`bugs`/`homepage` fields at all, so they carry no stale `devflow-cli` URL to fix. Adding these fields would be an enhancement beyond this issue.
  - `docs/package.json` has `"name": "devflow-cli-docs"` but no surface-metadata URLs; renaming the docs package name is a separate concern from npm-registry-surfaced repository metadata.
  - Remaining matches under `.claude/worktrees/**` are transient agent worktree copies, not the live working tree.
- Verification: `npm --prefix .../gitwise run lint` clean across all three workspaces; `npm --prefix .../gitwise test` → 208/208 tests pass across 19 suites; JSON validity confirmed by parsing both files with `node -e` and reading back the three URL fields.
