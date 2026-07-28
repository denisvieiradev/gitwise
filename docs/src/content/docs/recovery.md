---
title: Manual Recovery
description: Step-by-step procedures to restore your repository when ROLLBACK_PARTIAL (exit code 81) is reported.
---

When a `gw` command fails mid-way and its compensating rollback actions cannot fully complete, the CLI logs a **`ROLLBACK_PARTIAL`** warning (exit code `81`). The transaction started but could not restore a clean pre-command state automatically. This page gives exact recovery steps for each affected command.

Before starting, run `git status`, `git stash list`, and `git branch` to understand the current state of your repository.

## Release Prepare

`gw release prepare` may leave an orphan release branch and a stale plan file when it crashes mid-way.

**Symptoms**: a `release/<version>` branch that did not exist before, or a `.gitwise/release-plan.json` file present without a completed prepare.

**Recovery steps**:

1. Identify the orphan branch:
   ```sh
   git branch | grep release/
   ```

2. Switch to your working branch if you are currently on the orphan:
   ```sh
   git checkout main
   ```

3. Delete the orphan release branch:
   ```sh
   git branch -D release/<version>
   ```

4. Remove the stale plan file if it exists:
   ```sh
   rm -f .gitwise/release-plan.json
   ```

5. If the branch was already pushed to the remote, delete it there too:
   ```sh
   git push origin --delete release/<version>
   ```

6. Re-run `gw release prepare` — the repository is now back to its pre-prepare state.

## Commit Split

`gw commit` (commit-split mode) saves a named git stash at the very start of the split flow so your pre-split working tree can always be recovered. If the split fails **and** the automatic rollback also fails, the stash remains in place for manual recovery.

**Symptoms**: exit code `81` from `gw commit`, and `git stash list` shows a stash whose name starts with `gitwise/split-`.

**Finding the stash**:

```sh
git stash list | grep "gitwise/split-"
```

The stash name follows the format `gitwise/split-<ISO8601-timestamp>`, for example:

```
stash@{0}: On main: gitwise/split-2026-05-23T14:30:00.000Z
```

**Recovery steps**:

1. Identify any partial commits the split applied before it failed:
   ```sh
   git log --oneline -10
   ```

2. Reset to the commit SHA that existed before the split started (use `N` for the number of partial commits to undo):
   ```sh
   git reset --soft HEAD~N
   ```

3. Reset the working tree and index to HEAD before popping the stash (required — the `--index` flag is incompatible with `--include-untracked` stashes):
   ```sh
   git reset --hard HEAD
   git clean -fd
   ```

4. Pop the named stash to restore your original staged state:
   ```sh
   git stash pop stash@{<N>}
   ```
   Replace `<N>` with the index shown by `git stash list` (typically `0` if it is the most recent stash).

5. Your working tree is now exactly as it was before `gw commit` ran. You can retry the commit-split or commit manually.

## Release Finish — Push Rejected

`gw release finish` deletes `.gitwise/release-plan.json` before tagging and pushing, so a `finish` re-run is never applied twice. If the tag creation or the final push then fails — most commonly a rejected non-fast-forward push because `origin/<mainBranch>` advanced while the release was being prepared or finished (for example a CI bot committing directly to `main`) — `gw release finish` surfaces a `FINISH_PUSH_FAILED` error and cannot be re-run: the plan is gone, and the release commit already exists locally, so `gw release prepare` will also refuse with `NO_COMMITS`.

**Symptoms**: `gw release finish` fails with `FINISH_PUSH_FAILED` (or the underlying `git push`/`git tag` error), and neither `gw release finish` nor `gw release prepare` can be run again.

**Recovery steps**:

1. Check whether the tag already reached the remote (it can succeed even when the branch push is rejected):
   ```sh
   git ls-remote --tags origin v<version>
   ```

2. If the tag is missing, create it locally from the preserved notes file — do not touch `package.json`/`CHANGELOG.md` again, the release commit already exists:
   ```sh
   git tag -a v<version> -F .gitwise/release-<version>.md
   ```

3. Reconcile with the remote using a **merge, never a rebase**. Rebasing would give the release commit a new hash, orphaning the tag that already points at the original commit:
   ```sh
   git fetch origin
   git merge origin/<mainBranch>
   ```

4. Push the branch and tag together:
   ```sh
   git push origin <mainBranch> --follow-tags
   ```

## Workspace Version Bump

`gw release prepare` propagates the new version to each `packages/*/package.json` in sequence. If a write fails partway through, some manifests are already bumped while others still carry the old version.

**Symptoms**: `git diff` shows only some `package.json` files with version changes, not all of them.

**Recovery steps**:

1. Identify which manifests were already bumped:
   ```sh
   git diff --name-only | grep package.json
   ```

2. Revert each affected manifest to its committed state:
   ```sh
   git checkout HEAD -- packages/<name>/package.json
   ```

   Or revert all manifest changes at once:
   ```sh
   git checkout HEAD -- packages/*/package.json package.json
   ```

3. Confirm all manifests are back to their committed versions:
   ```sh
   git diff -- package.json packages/*/package.json
   # should produce no output
   ```

4. Re-run `gw release prepare` from the now-clean state.
