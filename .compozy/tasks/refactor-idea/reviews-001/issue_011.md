---
provider: manual
pr:
round: 1
round_created_at: 2026-05-17T17:23:38Z
status: resolved
file: scripts/release.mjs
line: 144
severity: medium
author: claude-code
provider_ref:
---

# Issue 011: release.mjs creates lightweight tags, has no dirty-tree or tag-exists guard

## Review Comment

Three independent problems in the Phase 0 release script that compound into a fragile UX:

1. **Lightweight tag (line 144)**: `execFileSync("git", ["tag", name], …)` creates a lightweight tag. Lightweight tags carry no tagger/timestamp/message and are typically created locally for personal use. Release tags should be annotated (`git tag -a <name> -m <msg>`) so `git describe`, `gh release view`, and `git for-each-ref --format='%(taggerdate)'` work cleanly for audits and changelog tooling.

2. **No dirty-tree check (around line 152-176, before any mutation)**: The script does not run `git status --porcelain` before staging. If the operator has uncommitted changes or staged work, the script will happily mix those into the `chore(release): vX.Y.Z` commit (via `git add packages/*/package.json package.json`) or leave the index dirty between version-bump-commit and tag, depending on staging behavior. Either way, the release commit becomes contaminated and may include unrelated work.

3. **No tag-exists check (line 168, before `git.tag(tag)`)**: If the script is re-run with the same effective version (e.g., the operator forgot it already ran), `git tag` fails with a cryptic `fatal: tag 'vX.Y.Z' already exists`, but only AFTER `git commit` has already produced a release commit. The repo is left in a half-applied state — the version bump is committed but the tag is missing.

**Suggested fix**: In `runRelease()`, add at the top (before any writes):

```js
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: rootDir }).toString().trim();
if (dirty) {
  throw new Error("Working tree must be clean before releasing — commit or stash first.\n" + dirty);
}
```

Before `git.tag(tag)`, add:

```js
try {
  execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: rootDir });
  throw new Error(`Tag ${tag} already exists. Bump to a new version or delete the tag.`);
} catch (e) { /* rev-parse exit 1 means tag missing — that's what we want */ }
```

Change `tag(name)` to use `["tag", "-a", "-m", `Release ${name}`, name]`. Add tests covering all three guards.

## Triage

- Decision: `VALID`
- Root cause: All three sub-issues confirmed in `scripts/release.mjs`.
  1. `defaultGit().tag()` at line 144 ran `git tag <name>` (no `-a`/`-m`), producing a lightweight tag — release tags should be annotated so `git describe`, `git for-each-ref --format='%(taggerdate)'`, and `gh release view` work for audit/changelog tooling.
  2. `runRelease()` had no `git status --porcelain` precheck. The script stages a specific manifest list via `git add -- <paths>`, but `git commit -m ...` commits **all** currently-staged files, so any operator-staged work would be silently rolled into `chore(release): vX.Y.Z`. The dirty-tree guard also belongs *before* manifest mutation so an unclean tree never causes partial writes.
  3. `runRelease()` had no `git rev-parse refs/tags/<name>` precheck. Re-running with the same effective version produced a release commit first and only then failed at `git tag`, leaving the repo half-applied (bump committed, no tag).
- Fix:
  - `tag(name)` now calls `git tag -a -m "Release <name>" <name>`.
  - `defaultGit` exposes two new optional hooks: `statusPorcelain()` (returns raw `git status --porcelain` output) and `tagExists(name)` (returns boolean via `git rev-parse --verify --quiet refs/tags/<name>`).
  - `runRelease()` invokes both hooks *before* `propagateVersion()`/`git.add`/`git.commit`/`git.tag`, throwing a descriptive error on a dirty tree or pre-existing tag. The checks are guarded by `typeof === "function"` so existing injected `GitClient` test doubles in `__tests__/` and Phase-1 callers that only implement `add`/`commit`/`tag` keep working.
- Scope note: The batch lists `scripts/release.mjs` as the only in-scope code file. `scripts/release.d.mts` is the co-located TypeScript contract for the script (consumed by tests via `allowJs`-free imports) and would diverge from runtime if the new optional `GitClient` hooks weren't declared, so it was updated as the minimum necessary touch — both new members are declared `?:` to stay backward-compatible with existing implementations.
- Tests: No production test file exists for `scripts/release.mjs` in the current tree (commit `3f041ee chore: remove legacy root scaffolding and wire workspace jest projects` removed the root-level `__tests__/` project alongside the now-deleted `legacy` Jest project). The replacement Jest config (`jest.config.ts`) only discovers `packages/*/jest.config.*`; wiring a new root project just for `scripts/` is out of scope for this single-issue batch and was deliberately not added. The fix instead preserves the script's existing injectable `GitClient` surface (now extended with two optional hooks) so future test wiring stays trivial, and was validated end-to-end via the smoke run in **Verification** below.

### Files changed
- `scripts/release.mjs` — annotated tag; new `defaultGit.statusPorcelain()` and `defaultGit.tagExists()` hooks; dirty-tree and tag-exists guards added at the top of `runRelease()` before any mutation.
- `scripts/release.d.mts` — `GitClient` interface gains optional `statusPorcelain?(): string` and `tagExists?(name: string): boolean`.

### Verification
- `npm run typecheck` — passes (3 workspaces, `tsc --noEmit`, exit 0).
- `npm run lint` — passes (each workspace runs `tsc --noEmit` as its lint, exit 0).
- `npm test` — passes: 19 suites, 224 tests, 0 failures (Jest, 3 projects).
- End-to-end smoke (`/tmp/release-smoke` fixture, fresh repo at `0.1.0`):
  - Run 1 (clean tree, no existing tag): `node scripts/release.mjs patch` → `Released v0.1.1`. `git cat-file -t v0.1.1` → `tag` (annotated, not lightweight). `git for-each-ref refs/tags/v0.1.1` shows taggername `Smoke` and subject `Release v0.1.1`.
  - Run 2 (re-run with same version): `node scripts/release.mjs 0.1.1` → exits with `release.mjs: Tag v0.1.1 already exists. Bump to a new version or delete the tag.` No second commit, no duplicate tag.
  - Run 3 (untracked file in tree): `node scripts/release.mjs patch` → exits with `release.mjs: Working tree must be clean before releasing — commit or stash first.` followed by the `git status --porcelain` listing. No mutation occurred (tag list still `v0.1.1`, HEAD subject still `chore(release): v0.1.1`), confirming the guard runs before `propagateVersion`/`git.add`/`git.commit`.
