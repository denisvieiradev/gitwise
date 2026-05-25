// Shared typed-error formatter for the release lifecycle (task_09).
//
// Maps every typed `code` produced by `prepareRelease` / `finishRelease` /
// `abortRelease` (plus reused codes from `release()` / `applyRelease`) to a
// one-line message AND an actionable recovery hint that the CLI surfaces via
// `@clack/prompts`. Keeping this switch in one place makes the three handlers
// share the same UX vocabulary and makes the hint coverage trivially testable.

export interface FormattedReleaseError {
  message: string;
  hint: string;
}

const UNKNOWN_HINT =
  "Check the error message above and the gitwise docs for recovery steps.";

export function formatReleaseError(err: unknown): FormattedReleaseError {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";

  switch (code) {
    case "STRATEGY_DEVELOP_MISSING":
      return {
        message,
        hint: "Create the develop branch (e.g. `git checkout -b develop`) or switch `releaseStrategy` to `github-flow` in `.gitwise.json`.",
      };
    case "RELEASE_BRANCH_CONFLICT":
    case "STRATEGY_RELEASE_BRANCH_EXISTS":
      return {
        message,
        hint: "Delete the existing release branch (`git branch -D release/<version>`) or pick a different version with `--bump`. If a prior `gw release prepare` crashed mid-way, see docs/recovery.md.",
      };
    case "STALE_PLAN_TAG_EXISTS":
      return {
        message,
        hint: "Run `gw release abort` to clear the saved plan, or delete the conflicting tag with `git tag -d v<version>` and retry.",
      };
    case "STALE_PLAN_BRANCH_MISMATCH":
      return {
        message,
        hint: "Check out the branch the plan targets (`git checkout <targetBranch>`) before re-running `gw release finish`.",
      };
    case "NO_RELEASE_PLAN":
      return {
        message,
        hint: "Run `gw release prepare` first to generate and persist a release plan.",
      };
    case "RELEASE_PLAN_EXISTS":
      return {
        message,
        hint: "Finish the in-flight release with `gw release finish`, or discard it with `gw release abort`, before running `gw release prepare` again.",
      };
    case "INVALID_PLAN_SCHEMA":
      return {
        message,
        hint: "The plan file was written by an incompatible gitwise version. Run `gw release abort` to discard it, then `gw release prepare` again.",
      };
    case "INVALID_PLAN_JSON":
      return {
        message,
        hint: "The plan file is corrupt. Run `gw release abort` to discard it, then `gw release prepare` again.",
      };
    case "WORKING_TREE_DIRTY":
      return {
        message,
        hint: "Commit or stash your local changes (`git status` to inspect) before retrying.",
      };
    case "TAG_EXISTS":
      return {
        message,
        hint: "Bump to a new version with `--bump` or delete the existing tag (`git tag -d v<version>` and `git push --delete origin v<version>` if pushed).",
      };
    case "NO_COMMITS":
      return {
        message,
        hint: "Add at least one commit since the last release before preparing a new one.",
      };
    case "INVALID_VERSION":
      return {
        message,
        hint: "Set `version` in `package.json` to a valid semver (e.g. `1.2.3`) before retrying.",
      };
    case "NO_PACKAGE_JSON":
      return {
        message,
        hint: "Run gitwise from a directory that contains a `package.json` at the repo root.",
      };
    case "RELEASE_BRANCH_UNMERGED":
      return {
        message,
        hint: "Merge the release branch into the surfaced target first, or delete it manually (`git branch -D <branch>`) before retrying `gw release abort`.",
      };
    case "COMMIT_HOOK_FAILURE":
      return {
        message,
        hint: "A pre-commit hook rejected the release commit. Inspect the hook output and resolve the issue, then run `git reset --hard HEAD` to clear the partial manifest/CHANGELOG writes and re-run `gw release finish`. Alternatively, run `gw release abort` to discard the in-flight release.",
      };
    case "FINISH_MERGE_CONFLICT":
      return {
        message,
        hint: "Resolve the merge conflicts (`git status` lists the files), then `git merge --continue`. The release plan file has already been deleted, so `gw release finish` cannot be re-run — finish tagging and pushing manually with `git tag -a v<version> -F .gitwise/release-<version>.md` and `git push --follow-tags origin <main-branch>`.",
      };
    case "NOTES_READ_FAILED":
      return {
        message,
        hint: "Recreate `.gitwise/release-<version>.md` (you can copy it from the persisted plan's `notes` field in `.gitwise/release-plan.json`) and re-run `gw release finish`, or run `gw release abort` to discard the in-flight release.",
      };
    default:
      return { message, hint: UNKNOWN_HINT };
  }
}
