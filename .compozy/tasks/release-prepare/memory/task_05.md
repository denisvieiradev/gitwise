# Task Memory: task_05.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement `prepareRelease(opts)` in `packages/core/src/commands/release.ts`. Reuse existing `release()` planner; for gitflow create release branch + bump manifests + CHANGELOG on it; for github-flow only write notes file. Write `.gitwise/release-plan.json` last (ADR-003 invariant), after `ensureGitignored`. Add unit + integration tests covering every typed error path.

## Important Decisions

- Strategy resolved internally via `readRepoConfig(cwd)` so the CLI does not need to pre-resolve it. Falls back: `opts.strategy` → `RepoConfig.releaseStrategy` → `"github-flow"`. `developBranch`: `opts.developBranch` → `RepoConfig.developBranch` → `"develop"`.
- `STRATEGY_RELEASE_BRANCH_EXISTS` check happens AFTER `release()` returns, because we need `newVersion` to know the branch name. Wasted LLM cost on that error path is acceptable (rare) — the check still throws before any branch/file mutation and before `saveReleasePlan`.
- `baseCommit` is captured right after preflight (no mutations yet) — matches the user's current HEAD when prepare starts (could be develop, could be a feature branch — gitflow does not require user to be on develop).
- GitFlow: commit the package.json bump + CHANGELOG + ensureGitignored change in a single `chore(release): v<version>` commit on the release branch, so the release branch ends in a clean state and `finish` can merge it directly. Plan file is written AFTER that commit (gitignored, so doesn't contaminate the commit).
- GitHub-flow: no commits, no manifest mutations. Only writes the notes file + plan file. `.gitignore` modification (if any) is left uncommitted by design (ADR-003 says we print a notice).

## Learnings

- `git.createBranch` switches you onto the new branch (`git checkout -b`), so after the call the working dir is on the release branch and subsequent file writes land there.
- `release()` itself handles `NO_PACKAGE_JSON` + `NO_COMMITS`; we must run our preflight + strategy preconditions BEFORE calling `release()` to avoid paying LLM cost on those branches.
- ADR-003 mandates "plan written last" — `saveReleasePlan` must come after ALL other mutations, including the gitflow commit. `ensureGitignored` must be called BEFORE `saveReleasePlan` so the file never appears as a tracked modification.

## Files / Surfaces

- `packages/core/src/commands/release.ts` — added `PrepareReleaseOptions`, `prepareRelease`. Reuses `release()` and `CHANGELOG_HEADER`.
- `packages/core/src/index.ts` — exported `prepareRelease` + `PrepareReleaseOptions`.
- `packages/core/__tests__/unit/commands/release.test.ts` — extended with prepareRelease unit suites.
- `packages/core/__tests__/integration/release-prepare.test.ts` — new file with full lifecycle integration tests.

## Errors / Corrections

- (none yet)

## Ready for Next Run

- task_06 (finishRelease) should `loadReleasePlan`, validate against repo state, then perform strategy-driven merges. For gitflow, expect the release branch to already carry a committed version-bump+changelog (made here in prepare). For github-flow, expect package.json/CHANGELOG to be untouched and `finish` to mutate them.
