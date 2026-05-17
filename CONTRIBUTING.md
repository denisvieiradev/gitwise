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

## Releasing (Phase 0)

gitwise is in **Phase 0** of the release plan recorded in [ADR-005](.compozy/tasks/refactor-idea/adrs/adr-005.md):
all workspaces share a single locked version, and the release is cut from a
maintainer's machine using a small Node script. Phase 1 — when `gw release`
dogfoods itself against this repo — replaces the manual step. `scripts/release.mjs`
**stays in the repo as the documented fallback** after Phase 1 (per ADR-005).

### Per-release runbook

1. Make sure `main` is green and `CHANGELOG.md` has an entry for the version
   you are about to cut. The release workflow uses the top `## ` section of
   `CHANGELOG.md` as the GitHub release body.
2. From the repo root, run the bump propagator. It accepts `patch`, `minor`,
   `major`, or an explicit `X.Y.Z`:

   ```bash
   node scripts/release.mjs patch
   # or: node scripts/release.mjs 0.2.0
   ```

   The script bumps the root `package.json`, propagates the same version to
   every `packages/*/package.json`, stages the changes, creates a
   `chore(release): vX.Y.Z` commit, and tags `vX.Y.Z`. It deliberately does
   **not** push.
3. Push the commit and the tag:

   ```bash
   git push origin HEAD
   git push origin vX.Y.Z
   ```

4. Pushing the tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
   which installs dependencies, builds every workspace, runs the full test
   suite, and only then publishes each package via
   `npm publish --workspaces --access public` and opens a GitHub release using
   the CHANGELOG entry. A failing test aborts the publish.

### Required repository secrets

| Secret           | Purpose                                                          |
|------------------|------------------------------------------------------------------|
| `NPM_TOKEN`      | Authenticates `npm publish` against the npm registry             |
| `GITHUB_TOKEN`   | Default token used by `gh release create` (provided by Actions)  |

### Rolling back a botched release

If `release.mjs` ran but you have not pushed yet, undo it locally:

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
