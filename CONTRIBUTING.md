# Contributing to gitwise

Thank you for your interest in contributing to `gitwise` — the AI git toolbelt (`commit` / `review` / `pr` / `release`).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 18 (matches `.nvmrc`)
- [Git](https://git-scm.com)
- [GitHub CLI (`gh`)](https://cli.github.com) (optional, for PR creation)

### Setup

```bash
git clone https://github.com/denisvieiradev/gitwise.git
cd gitwise
npm install
```

`npm install` from the root resolves every workspace under `packages/*` in a single pass.

## Repository Layout

gitwise is an [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) monorepo:

```
gitwise/
├── package.json            # private workspaces root (no shipped artifact)
├── tsconfig.base.json      # shared compilerOptions every package extends
├── tsconfig.json           # transitional: covers the legacy src/ tree
├── tsup.config.ts          # shared bundler helper (defineGitwiseTsup)
├── jest.config.ts          # aggregates per-package jest configs via `projects`
├── packages/               # publishable packages live here (see ADR-002)
│   ├── core/               # @denisvieiradev/gitwise-core (added in later tasks)
│   ├── cli/                # @denisvieiradev/gitwise         (added in later tasks)
│   └── skills/             # @denisvieiradev/gitwise-skills  (added in later tasks)
├── src/                    # transitional source — migrated into packages/core in later tasks
├── __tests__/              # transitional tests — partitioned into per-package suites later
└── __mocks__/              # module mocks used by the transitional jest project
```

The `packages/` directory exists as soon as the workspace skeleton is in place (with a `.gitkeep` until real packages land). Subsequent refactor tasks drop `core`, `cli`, and `skills` into it.

## Available Scripts

Root scripts delegate to workspaces and also keep the transitional legacy `src/` build alive. They all run from the repo root.

| Script                | What it does                                                                          |
|-----------------------|---------------------------------------------------------------------------------------|
| `npm run build`       | `build:legacy` then `build:workspaces` (both must succeed)                            |
| `npm run build:legacy`| Bundles the transitional `src/cli/index.ts` via `tsup`                                |
| `npm run build:workspaces` | `npm run --workspaces --if-present build` — fans out to every package         |
| `npm run dev`         | `tsup --watch` for the transitional CLI                                               |
| `npm test`            | Jest with `projects` aggregating the legacy suite plus any `packages/*/jest.config.*` |
| `npm run test:coverage` | Same as `npm test` with coverage reporting                                          |
| `npm run lint`        | `tsc --noEmit` (legacy) then `npm run -ws --if-present lint`                          |
| `npm run typecheck`   | `tsc --noEmit` (legacy) then `npm run -ws --if-present typecheck`                     |

Workspace-scoped commands work the usual way:

```bash
# Run a script in a single workspace
npm run -w packages/core build

# Run a script in every workspace that defines it
npm run --workspaces --if-present test
```

## Adding a New Workspace Package

1. Create the directory under `packages/<name>/`.
2. Add a `package.json` with a unique `"name"`, `"version"` matching the locked monorepo version, and the scripts the root delegates to (`build`, `test`, `lint`, `typecheck`).
3. Add `packages/<name>/tsconfig.json` extending the root base:

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "dist",
       "rootDir": "src"
     },
     "include": ["src"]
   }
   ```

4. Add `packages/<name>/tsup.config.ts` that consumes the shared helper:

   ```ts
   import { defineGitwiseTsup } from "../../tsup.config.js";

   export default defineGitwiseTsup({
     entry: ["src/index.ts"],
     outDir: "dist",
   });
   ```

5. Add `packages/<name>/jest.config.ts`. The root `jest.config.ts` auto-discovers any `packages/*/jest.config.{ts,js,mjs}` and folds it into its `projects` array.
6. Link sibling workspace deps via the workspace protocol when needed:

   ```jsonc
   // packages/cli/package.json
   {
     "dependencies": {
       "@denisvieiradev/gitwise-core": "workspace:*"
     }
   }
   ```

7. Run `npm install` from the root to register the new workspace and re-hoist `node_modules`.

## Running the Transitional CLI Locally

The CLI is still served from the legacy `src/cli/index.ts` until the porting tasks complete. To exercise it:

```bash
npm run build
node dist/index.js --help
```

For active development, use watch mode so the build updates as you edit:

```bash
npm run dev
```

## Development Workflow

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** — write code, add tests, update docs if needed.

3. **Run checks** before committing:
   ```bash
   npm run lint
   npm test
   npm run build
   ```

4. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) format:
   ```bash
   git commit -m "feat: add support for X"
   ```
   Common prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`

5. **Push** your branch and **open a Pull Request** against `main`.

## Guidelines

- Write TypeScript in strict mode (every workspace extends `tsconfig.base.json`).
- Follow ESM module conventions (`"type": "module"`).
- Add tests for new logic. Tests live next to the package that owns them (`packages/<name>/__tests__/`) or — for transitional code — in the root `__tests__/`.
- Keep PRs focused — one feature or fix per PR.
- Update the README if you add new commands or change behavior.
- Never commit API keys or `~/.gitwise/.env` contents.

## Releasing

gitwise is in **Phase 1** of the release plan recorded in [ADR-005](.compozy/tasks/refactor-idea/adrs/adr-005.md):
Phase 0 (manual releases cut with a small Node script) ended at `v0.1.0`.
Releases are now cut by running `gw release` — the CLI dogfoods itself
against this repo — with npm publishing hardened to GitHub Actions OIDC
(no stored npm token needed for normal releases).

The full step-by-step runbook, including one-time npm Trusted Publisher
setup, lives in [`docs/src/content/docs/releasing.md`](docs/src/content/docs/releasing.md).
Summary:

1. Make sure `main` is green and `CHANGELOG.md` has an entry for the version
   you are about to cut.
2. `gw release prepare` (optionally `--bump minor|major`) — analyzes commits,
   proposes a version, writes a `.gitwise/release-<version>.md` plan.
3. Review/edit the plan, then `gw release finish` — bumps every
   `packages/*/package.json`, commits, creates a signed tag, and pushes.
4. Pushing the `v*` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml):
   build, test, GPG-sign the tag, publish all three packages to npm via OIDC
   with provenance, generate an SBOM, and open a GitHub release from the
   CHANGELOG entry. A failing test aborts the publish.

Two independent fallbacks exist for when the primary flow can't run, per
ADR-005:

- If `gw release` itself is unavailable, `scripts/release.mjs` (the old
  Phase 0 bump propagator) still works — run `node scripts/release.mjs
  patch|minor|major|X.Y.Z` to bump and tag manually (`--help`-style usage is
  printed on invalid args).
- If OIDC is misconfigured but `gw release` produced a valid tag, dispatch
  `release.yml` manually with a stored `NPM_TOKEN` — see
  `docs/src/content/docs/releasing.md`'s "Emergency publish with NPM_TOKEN"
  section.

### Required repository secrets

| Secret           | Purpose                                                                                   |
|------------------|---------------------------------------------------------------------------------------------|
| `GPG_PRIVATE_KEY`| Signs release tags. Passphrase-less — no `GPG_PASSPHRASE` secret exists or is needed.       |
| `NPM_TOKEN`      | Emergency-only fallback for `npm publish` when OIDC is unavailable (`use_npm_token: true`). Not required for normal releases. |
| `GITHUB_TOKEN`   | Default token used by `gh release create` (provided by Actions)                             |

### Rolling back a botched release

For the primary `gw release` flow: if you ran `gw release prepare` but
haven't run `finish` yet, run `gw release abort` to discard the plan.

For the `scripts/release.mjs` fallback path: if it ran but you haven't
pushed yet, undo it locally:

```bash
git tag -d vX.Y.Z
git reset --hard HEAD~1
```

If the tag has already been pushed and CI has not yet published, delete the
remote tag (`git push origin :refs/tags/vX.Y.Z`) and start over. Once a
package version is on npm it cannot be reused; bump again instead.

## Reporting Issues

Use [GitHub Issues](https://github.com/denisvieiradev/gitwise/issues) to report bugs or request features. Include:

- Steps to reproduce
- Expected vs actual behavior
- Your environment (Node.js version, OS, gitwise version)

## Writing a Transactional Flow

Multi-step git flows that mutate repository state must use the `Transaction` primitive from `@denisvieiradev/gitwise-core` so that a mid-flow failure leaves the repository in its pre-command state rather than a partial state.

**Pattern** (see `core/src/infra/transaction.ts`):

```ts
const tx = new Transaction();
try {
  const result = await tx.run({
    name: "my-step",
    apply: async () => { /* perform the mutation */ },
    compensate: async (result) => { /* undo the mutation */ },
  });
  // ... more steps
} catch (err) {
  await tx.rollback(wrapError(err), logger);
  throw err;
}
```

Key rules:
- Call `tx.run(step)` for every side-effectful step. Steps are rolled back in LIFO order.
- Each `compensate` must undo exactly what its paired `apply` did. Test both paths in isolation.
- If `compensate` itself can fail, log the failure but do not throw — the transaction surfaces a `ROLLBACK_PARTIAL` warning automatically.
- Acquire the repo lock (`acquireRepoLock`) before the first `tx.run` call and release it in `finally`.

**Worked example**: `core/src/commands/release.ts` → `prepareRelease()` is the canonical reference implementation. It wraps branch creation, gitignore mutation, CHANGELOG, manifest writes, notes, and plan file as individual steps with compensating actions. See [ADR-004](https://github.com/denisvieiradev/gitwise/blob/main/.compozy/tasks/deliver-community/adrs/adr-004.md) for the architectural rationale.

If a flow produces `ROLLBACK_PARTIAL`, users are directed to [docs/recovery.md](https://denisvieiradev.github.io/gitwise/recovery/) for manual recovery steps.

## Hotfix Exception

CodeQL and OSV-Scanner run on every PR and block merge on findings. In rare cases, a security scanner may block a release-critical hotfix.

**Single-PR exception**: a hotfix PR may be merged with an active CodeQL or OSV-Scanner finding **only when all of the following are true**:

1. The finding is confirmed to be a false positive or an unfixable transitive dependency issue (not a code defect in gitwise itself).
2. The maintainer explicitly labels the PR `hotfix-exception` and documents the justification in the PR description.
3. A follow-up issue or PR is filed within 24 hours to resolve or suppress the finding with proper context (a `# nosec` comment with explanation, or an `osv-scanner.toml` ignore entry with an expiry date — see [Adding an OSV Ignore Entry](#adding-an-osv-ignore-entry)).

The follow-up must be addressed within the next release cycle. A hotfix that closes without a follow-up is a policy violation. The maintainer is responsible for tracking it.

## Security Test Expectations

Every PR that touches subprocess invocation or file-path handling must maintain two categories of security tests:

**Subprocess argument safety** (`packages/core/__tests__/unit/infra/`): assert that `execFile` is always called with an **array** of arguments, never a shell-interpolated string. A future refactor that introduces `shell: true` or string concatenation in argument position must fail this test. The tests cover all wrappers in `git.ts`, `github.ts`, and `claude-code.ts`.

**Sensitive-file blocklist** (`packages/core/__tests__/unit/`): assert that every pattern in the blocklist matches representative sensitive paths (`.env`, `id_rsa`, `*.pem`, `*.key`, etc.) and that legitimate paths are not blocked. Changes to the blocklist require corresponding test updates to maintain coverage of both blocked and allowed path patterns.

If you add a new subprocess wrapper or extend the sensitive-file blocklist, add matching tests in the same PR. CI enforces an 80% coverage threshold; a new untested wrapper will cause the coverage gate to fail.

## Adding an OSV Ignore Entry

When OSV-Scanner surfaces a HIGH or CRITICAL finding that has no available fix (e.g., a transitive dependency with an unfixed CVE), you may acknowledge it via `osv-scanner.toml`. This file is checked in and reviewed as code.

**Required fields** for every ignore entry:

```toml
[[IgnoredVulns]]
id = "GHSA-xxxx-xxxx-xxxx"          # the exact OSV/GHSA identifier
ignoreUntil = "2026-09-01"          # REQUIRED expiry date — no open-ended ignores
reason = "No fix available upstream; tracking in #<issue-number>."
```

**Rules**:
- `ignoreUntil` is mandatory. The workflow fails the build when this date passes, forcing review.
- Set the expiry to no more than 90 days out unless a longer upstream fix timeline is documented in `reason`.
- Include a GitHub issue number in `reason` so the finding can be tracked.
- Entries that expire and are not renewed cause CI failures — resolve the underlying issue or file a new justified entry.

The OSV-Scanner ignore list is reviewed at each release cycle. Stale entries (past their `ignoreUntil` date) must be either renewed with fresh justification or removed as the dependency is updated.
