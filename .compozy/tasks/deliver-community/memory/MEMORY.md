# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State
- tasks 01–18 complete. All deliver-community tasks finished. task_18: README.md overhauled with badges and 4 new sections; `readme-content.test.ts` (20 tests); `TODO(community-launch)` resolved in GOVERNANCE.md.
- task_11 completed AFTER task_10 (dependency inversion); CODEOWNERS at `.github/CODEOWNERS` with `* @denisvieiradev`.

## Shared Decisions
- `GitwiseError.toJSON()` emits `{ name, code, exitCode, message, details? }`. `cause` intentionally omitted.
- `EXIT_CODES` typed `Readonly<Record<string, number>>` (not `as const`) for dynamic-key lookups under `noUncheckedIndexedAccess`.
- `details` is the canonical side-channel on `GitwiseError`; tests read `err.details.*` not top-level keys.
- ESM mock caveat: `jest.spyOn` on `node:fs/promises` fails; inject failures via real state. Prefer `rejects.toMatchObject({ code })` over `rejects.toBeInstanceOf`.
- **Stash compensate pattern**: `git reset --hard HEAD && git clean -fd` BEFORE `git stash pop`; `--index` flag incompatible with `--include-untracked` stashes.
- Named stash convention: `gitwise/split-<ISO8601>`. `docs/recovery.md` (task_17) references this.
- `acquireRepoLock` treats current `process.pid` as alive; nested lock from same pid is REJECTED.

## Open Risks
- `providers/claude-code.ts` has three bare `throw new Error(...)` at lines 137/149/218 — follow-up only.
- task_16: `GPG_PRIVATE_KEY` secret, npm OIDC trust policy, and workflow dry-run against sibling fork are manual steps before first hardened release.
- task_10 complete. All three governance files exist. task_18 may reference them freely.

## Conventions
- Core tsconfig split: `tsconfig.json` (build) and `tsconfig.test.json` (test). Do not collapse.
- Test-only helpers in `__tests__/_helpers/`; excluded via `testPathIgnorePatterns`.
- Core test command: `npm run -w packages/core test [-- --testPathPattern=<pattern>]`.
- SBOM smoke test gated on `SBOM_SMOKE=1` env var.
- Tests calling `finishRelease`/`applyRelease` with `tagAndPush: true` must include `signTags: false`.

## GPG Key
- Fingerprint: `E73555F2E6F5547F2BC105C3BD8BA14C42504AFD`; public key at `KEYS.asc`; gnupg at `/opt/homebrew/bin/gpg`.

## Key Artifacts
- task_05: `Transaction` in `core/src/infra/transaction.ts`; `acquireRepoLock` in `core/src/infra/lockfile.ts`.
- task_07: `prepareRelease` transactional; `RELEASE_BRANCH_CONFLICT` (exitCode 61); lock acquired before dirty-tree preflight.
- task_08: `applyCommitPlan` transactional; `takeNamedStashStep`, `applyOneCommitStep` exported.
- task_11: `KEYS.asc`; `SECURITY.md` has Supply Chain + Key Rotation + CoC cross-link; `security-docs.test.ts`.
- task_12: `.github/dependabot.yml`; all `uses:` pinned to SHAs; `workflow-pinning.test.ts`.
- task_13: `.github/workflows/codeql.yml`; `workflow-codeql.test.ts`.
- task_14: `.github/workflows/osv-scanner.yml`; `osv-scanner.toml`; `workflow-osv-scanner.test.ts`.
- task_15: `.github/workflows/dependabot-auto-merge.yml`; `workflow-auto-merge.test.ts`.
- task_16: `release.yml` (OIDC + provenance + SBOM + signed tags); `workflow-release-hardened.test.ts`; `sbom-smoke.test.ts`.
- task_17: `docs/recovery.md`; `docs/supply-chain.md`; CONTRIBUTING.md 4 new sections; `docs-presence.test.ts`; `docs/src/content/config.ts` (legacy Astro collection fix).
- task_10: `community-docs.test.ts`; 22 tests covering CODEOWNERS, CODE_OF_CONDUCT.md, GOVERNANCE.md.
- task_18: `README.md` (badges + 4 sections); `readme-content.test.ts` (20 tests); `GOVERNANCE.md` TODO(community-launch) removed; `community-docs.test.ts` GOVERNANCE placeholder test removed.

## Astro Docs Build Note
- Node v25.9 + Astro 5.18 + Starlight 0.32: use `docs/src/content/config.ts` (legacy `defineCollection` with `docsSchema()`). Do NOT use `content.config.ts` + `docsLoader()` — it silently fails to load content because Node can't strip types from `@astrojs/starlight/loaders.ts` in node_modules.
- Build command (from `docs/` dir): `node_modules/.bin/astro build`
- Docs pages are at `docs/src/content/docs/*.md` — README links must use full path `docs/src/content/docs/exit-codes.md` etc.
