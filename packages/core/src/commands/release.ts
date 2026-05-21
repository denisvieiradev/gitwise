import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import * as git from "../infra/git.js";
import { isGhAvailable, createGitHubRelease } from "../infra/github.js";
import { fileExists, readJSON, writeJSON, ensureDir } from "../infra/filesystem.js";
import { loadTemplate } from "../template/loader.js";
import { interpolate } from "../template/interpolate.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug } from "../infra/logger.js";
import { readRepoConfig } from "../config/repo.js";
import {
  createReleaseStrategy,
  type ReleaseStrategyName,
} from "../strategies/release.js";
import {
  applyGitignoreEntry,
  deleteReleasePlan,
  ensureGitignored,
  loadReleasePlan,
  saveReleasePlan,
  type PersistedReleasePlan,
} from "./release-plan.js";

const RELEASE_PLAN_REL_PATH = ".gitwise/release-plan.json";
// ADR-003 preserves the notes file (.gitwise/release-<v>.md) after finish so the
// user can keep editing or archiving it. Gitignoring the glob keeps every past
// version's notes file out of the next prepare's clean-tree check without
// touching the file itself.
const RELEASE_NOTES_GLOB_REL_PATH = ".gitwise/release-*.md";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BumpType = "major" | "minor" | "patch";

export interface ReleasePlan {
  suggestedBump: BumpType;
  newVersion: string;
  currentVersion: string;
  changelog: string;
  notes: string;
  commits: string;
  tokens: { input: number; output: number };
}

export interface ReleaseOptions {
  cwd: string;
  provider: LLMProvider;
  bump?: BumpType;
  language?: string;
  templatesPath?: string;
  repoRoot?: string;
  workspacePropagation?: boolean;
}

export interface ApplyReleaseOptions {
  cwd: string;
  tagAndPush?: boolean;
  createGhRelease?: boolean;
  workspacePropagation?: boolean;
}

// ─── Version utilities ────────────────────────────────────────────────────────

const STRICT_SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function bumpVersion(current: string, type: BumpType): string {
  const match = STRICT_SEMVER_RE.exec(current);
  if (!match) {
    throw Object.assign(new Error(`Invalid current version: ${current}`), {
      code: "INVALID_VERSION",
    });
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
    // Belt-and-suspenders: TS makes this unreachable for typed callers, but
    // any JS caller (or a cast like `parseVersionSuggestion`'s former one)
    // could smuggle in a bogus value. Surface it as INVALID_VERSION instead
    // of silently returning undefined and minting `release/undefined` /
    // `vundefined` artifacts downstream.
    default: throw Object.assign(
      new Error(`Invalid bump type: ${String(type)}`),
      { code: "INVALID_VERSION" },
    );
  }
}

interface VersionSuggestion {
  suggestion: BumpType;
  reasoning: string;
}

function parseVersionSuggestion(raw: string): VersionSuggestion | null {
  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const { suggestion, reasoning } = parsed;
    // Constrain `suggestion` to the BumpType union — a `typeof === "string"`
    // check used to accept "huge" / "feature" / "" and cast them straight to
    // BumpType, after which bumpVersion's switch fell through and returned
    // undefined. Returning null on garbage routes release() to heuristicBump,
    // its existing safety net.
    if (
      (suggestion === "major" || suggestion === "minor" || suggestion === "patch") &&
      typeof reasoning === "string"
    ) {
      return { suggestion, reasoning };
    }
  } catch { /* fallback */ }
  return null;
}

/**
 * Heuristic bump from commit log strings.
 * BREAKING CHANGE / ! marker → major
 * feat: → minor
 * fix:/chore:/etc → patch
 */
export function heuristicBump(commits: string): BumpType {
  if (/BREAKING CHANGE|!:/.test(commits)) return "major";
  if (/^feat[:(]/m.test(commits)) return "minor";
  return "patch";
}

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org/).

`;

// ─── Core release function ────────────────────────────────────────────────────

/**
 * @deprecated Prefer the explicit two-phase lifecycle ({@link prepareRelease}
 * → caller-supplied confirm → {@link finishRelease}) or the unified
 * {@link runReleaseInProcess} helper. Kept exported so the legacy skill script
 * and any external callers using `release()` + `applyRelease()` keep working;
 * a future task may collapse it into `prepareRelease`.
 */
export async function release(opts: ReleaseOptions): Promise<ReleasePlan> {
  const { cwd, provider, language = "en" } = opts;

  const pkgPath = join(cwd, "package.json");
  if (!(await fileExists(pkgPath))) {
    throw Object.assign(new Error("No package.json found"), { code: "NO_PACKAGE_JSON" });
  }

  const pkg = await readJSON<{ version: string; name?: string }>(pkgPath);
  const currentVersion = pkg.version;
  const projectName = pkg.name ?? "project";

  const lastTag = await git.getLatestTag(cwd);
  const logRange = lastTag ? `${lastTag}..HEAD` : undefined;
  const commits = await git.getLog(cwd, logRange);

  if (!commits) {
    throw Object.assign(new Error("No new commits since last release"), { code: "NO_COMMITS" });
  }

  const templateOpts = {
    repoRoot: opts.repoRoot ?? cwd,
    templatesPath: opts.templatesPath,
  };

  const tier = resolveModelTier("release");
  let totalInput = 0;
  let totalOutput = 0;

  // 1. Determine bump type
  let suggestedBump: BumpType;
  if (opts.bump) {
    suggestedBump = opts.bump;
  } else {
    const versionTemplate = await loadTemplate("release-version", templateOpts);
    const versionPrompt = interpolate(versionTemplate, { currentVersion });

    debug("Calling LLM for version suggestion");
    const versionResponse = await provider.chat({
      systemPrompt: "You are a release engineer. Respond with JSON only.",
      userMessage: `${versionPrompt}\n\nCommits:\n${commits}`,
      tier,
    });
    totalInput += versionResponse.tokens.input;
    totalOutput += versionResponse.tokens.output;

    const suggestion = parseVersionSuggestion(versionResponse.content);
    suggestedBump = suggestion?.suggestion ?? heuristicBump(commits);
  }

  const newVersion = bumpVersion(currentVersion, suggestedBump);

  // 2. Generate changelog
  const changelogTemplate = await loadTemplate("release-changelog", templateOpts);
  const changelogPrompt = interpolate(changelogTemplate, { projectName });

  debug("Calling LLM for changelog generation");
  const changelogResponse = await provider.chat({
    systemPrompt: "You are a technical writer generating a changelog. Follow Keep a Changelog format.",
    userMessage: `${changelogPrompt}\n\nCommits:\n${commits}`,
    tier,
  });
  totalInput += changelogResponse.tokens.input;
  totalOutput += changelogResponse.tokens.output;
  const changelog = changelogResponse.content;

  // 3. Generate release notes
  const notesTemplate = await loadTemplate("release-notes", templateOpts);
  const notesPrompt = interpolate(notesTemplate, {
    version: newVersion,
    projectName,
    language,
  });

  debug("Calling LLM for release notes generation");
  const notesResponse = await provider.chat({
    systemPrompt: "You are a product communications specialist writing release notes.",
    userMessage: `${notesPrompt}\n\nCommits:\n${commits}`,
    tier,
  });
  totalInput += notesResponse.tokens.input;
  totalOutput += notesResponse.tokens.output;
  const notes = notesResponse.content;

  return {
    suggestedBump,
    newVersion,
    currentVersion,
    changelog,
    notes,
    commits,
    tokens: { input: totalInput, output: totalOutput },
  };
}

// ─── prepareRelease ──────────────────────────────────────────────────────────

export interface PrepareReleaseOptions extends ReleaseOptions {
  /** Strategy override; if omitted, resolved from RepoConfig (default "github-flow"). */
  strategy?: ReleaseStrategyName;
  /** Develop branch name override; if omitted, resolved from RepoConfig (default "develop"). */
  developBranch?: string;
}

/**
 * Run the planning half of the two-phase release lifecycle (ADR-001).
 *
 * Resolves the active strategy, validates preconditions (clean tree, develop
 * exists for gitflow, no pre-existing release branch), runs the LLM planner
 * via {@link release}, optionally creates the gitflow release branch and
 * commits a version bump + CHANGELOG entry on it, writes the user-editable
 * notes file, ensures `.gitwise/release-plan.json` is gitignored, and saves
 * the persisted plan **last** (ADR-003 invariant: the plan file's existence
 * means every earlier step succeeded). Does not tag, push, or merge — those
 * happen in {@link finishRelease}.
 */
export async function prepareRelease(
  opts: PrepareReleaseOptions,
): Promise<PersistedReleasePlan> {
  const { cwd } = opts;

  // 1. Resolve strategy + develop branch from opts → repo config → defaults.
  const repoConfig = await readRepoConfig(cwd);
  const strategyName: ReleaseStrategyName =
    opts.strategy ?? repoConfig?.releaseStrategy ?? "github-flow";
  const developBranch =
    opts.developBranch ?? repoConfig?.developBranch ?? "develop";
  const strategy = createReleaseStrategy(strategyName);

  debug("release.prepare.start", { strategy: strategyName, cwd });

  // 2. Preflight — refuse to start if the working tree is dirty. Runs before
  // any LLM call so we don't pay tokens on a doomed run.
  //
  // Filter `.gitignore` from the dirty set: prepare's step 11 mutates it via
  // `ensureGitignored`, and on github-flow that change is intentionally
  // deferred to finish (no commit happens in prepare). After a prior github-flow
  // `prepare → abort`, the leftover ` M .gitignore` (or `?? .gitignore`) would
  // otherwise block the next prepare and force the user to manually
  // `git checkout -- .gitignore`. Matches the symmetric tolerance in
  // finishRelease's step 2c.
  const dirtyEntries = (await git.status(cwd))
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.length >= 3)
    .filter((line) => line.slice(3).trim() !== ".gitignore");
  if (dirtyEntries.length > 0) {
    throw Object.assign(
      new Error(
        `Working tree must be clean before preparing a release — commit or stash first.\n${dirtyEntries.join("\n")}`,
      ),
      { code: "WORKING_TREE_DIRTY" },
    );
  }

  // 3. Refuse to clobber an in-flight plan. Mirrors ADR-003's "plan-first
  // delete" invariant in finishRelease: a persisted plan file is a contract
  // that prepare's earlier steps already succeeded. Re-running prepare without
  // finishing or aborting would silently overwrite that file (different
  // newVersion / baseCommit / preparedAt), erasing the only trace of the
  // prior run. Running this before the LLM call keeps retries cheap.
  const existingPlan = await loadReleasePlan(cwd);
  if (existingPlan) {
    throw Object.assign(
      new Error(
        `An in-flight release plan already exists at .gitwise/release-plan.json for v${existingPlan.newVersion} (${existingPlan.strategy}). Finish it with "gw release finish" or discard it with "gw release abort" before preparing a new release.`,
      ),
      { code: "RELEASE_PLAN_EXISTS" },
    );
  }

  // 4. Strategy preconditions — gitflow requires the develop branch to exist.
  if (strategy.requiresDevelop()) {
    if (!(await git.branchExists(cwd, developBranch))) {
      throw Object.assign(
        new Error(
          `GitFlow requires a "${developBranch}" branch but it does not exist. Create it first (e.g. git checkout -b ${developBranch}).`,
        ),
        { code: "STRATEGY_DEVELOP_MISSING" },
      );
    }
  }

  // 5. Capture the user's HEAD before any mutation so the plan records where
  // prepare started — useful for stale-plan diagnostics in finish.
  const baseCommit = await git.headSha(cwd);

  // 6. Run the LLM planner (also raises NO_PACKAGE_JSON / NO_COMMITS /
  // INVALID_VERSION before we touch the filesystem).
  const plan = await release(opts);

  // 7. Now that newVersion is known, derive the release branch name and check
  // it doesn't already exist (gitflow only — github-flow returns null).
  const releaseBranch = strategy.releaseBranchFor(plan.newVersion);
  if (releaseBranch && (await git.branchExists(cwd, releaseBranch))) {
    throw Object.assign(
      new Error(
        `Release branch "${releaseBranch}" already exists. Delete it or pick a different version.`,
      ),
      { code: "STRATEGY_RELEASE_BRANCH_EXISTS" },
    );
  }

  // 8. For gitflow, branch off develop and mutate manifests on the release
  // branch. For github-flow, manifests are deferred to finish.
  if (releaseBranch) {
    await git.createBranch(cwd, releaseBranch, developBranch);
    debug("release.prepare.branch.created", {
      branch: releaseBranch,
      from: developBranch,
    });
  }

  const targetBranch = releaseBranch ?? (await git.getBranch(cwd));

  // 9. Write the user-editable notes file (both strategies). Lives under
  // .gitwise/ which prepare will gitignore in step 11.
  await ensureDir(join(cwd, ".gitwise"));
  await writeFile(
    join(cwd, ".gitwise", `release-${plan.newVersion}.md`),
    plan.notes,
    "utf-8",
  );

  // 10. Gitflow-only: bump root package.json + write CHANGELOG entry, then
  // commit on the release branch so finish can merge it directly.
  if (releaseBranch) {
    const pkgPath = join(cwd, "package.json");
    const pkg = await readJSON<Record<string, unknown>>(pkgPath);
    pkg["version"] = plan.newVersion;
    await writeJSON(pkgPath, pkg);

    const changelogPath = join(cwd, "CHANGELOG.md");
    const date = new Date().toISOString().split("T")[0];
    const versionHeader = `## [${plan.newVersion}] - ${date}\n\n${plan.changelog}\n\n`;

    if (await fileExists(changelogPath)) {
      const existing = await readFile(changelogPath, "utf-8");
      const headerEnd = existing.indexOf("## [");
      if (headerEnd > 0) {
        const next =
          existing.slice(0, headerEnd) + versionHeader + existing.slice(headerEnd);
        await writeFile(changelogPath, next, "utf-8");
      } else {
        const body = existing.startsWith(CHANGELOG_HEADER)
          ? existing.slice(CHANGELOG_HEADER.length)
          : existing;
        await writeFile(
          changelogPath,
          CHANGELOG_HEADER + versionHeader + body,
          "utf-8",
        );
      }
    } else {
      await writeFile(changelogPath, CHANGELOG_HEADER + versionHeader, "utf-8");
    }
  }

  // 11. Ensure the plan file is gitignored BEFORE we write it (ADR-003: never
  // tracked). For gitflow, fold the .gitignore change into the version-bump
  // commit here; for github-flow the equivalent happens in finishRelease (it
  // stages .gitignore alongside package.json/CHANGELOG.md) since prepare
  // doesn't create a commit on this strategy. The notes-file glob is
  // gitignored alongside so old `.gitwise/release-<prev>.md` files left behind
  // by previous releases (ADR-003 keeps them on disk) don't trip this
  // function's clean-tree check on the next prepare.
  await ensureGitignored(cwd, RELEASE_PLAN_REL_PATH);
  await ensureGitignored(cwd, RELEASE_NOTES_GLOB_REL_PATH);

  if (releaseBranch) {
    const stagePaths = ["package.json", "CHANGELOG.md"];
    if (await fileExists(join(cwd, ".gitignore"))) {
      stagePaths.push(".gitignore");
    }
    await git.add(cwd, stagePaths);
    await git.commit(cwd, `chore(release): v${plan.newVersion}`);
  }

  // 12. Persist the plan LAST. Its presence on disk signals to finish/abort
  // that every preceding step succeeded.
  const persistedPlan: PersistedReleasePlan = {
    schema: 1,
    strategy: strategyName,
    currentVersion: plan.currentVersion,
    newVersion: plan.newVersion,
    suggestedBump: plan.suggestedBump,
    changelog: plan.changelog,
    notes: plan.notes,
    commits: plan.commits,
    preparedAt: new Date().toISOString(),
    baseCommit,
    targetBranch,
    releaseBranchCreated: releaseBranch !== null,
    tokens: plan.tokens,
  };

  await saveReleasePlan(cwd, persistedPlan);
  debug("release.prepare.plan.saved", {
    newVersion: plan.newVersion,
    targetBranch,
    releaseBranchCreated: persistedPlan.releaseBranchCreated,
  });

  return persistedPlan;
}

// ─── applyRelease ────────────────────────────────────────────────────────────

/**
 * @deprecated Prefer the explicit two-phase lifecycle ({@link prepareRelease}
 * → caller-supplied confirm → {@link finishRelease}) or the unified
 * {@link runReleaseInProcess} helper.
 *
 * Apply an in-memory {@link ReleasePlan} to the repository. Kept exported as
 * a thin adapter so the legacy skill script and any external callers that
 * still pair `release()` with `applyRelease()` keep working. Internally this
 * builds a {@link PersistedReleasePlan} from the in-memory plan, writes it
 * (and the user-editable notes file) to disk so {@link finishRelease} can
 * consume it, and then delegates the mutation pipeline to
 * {@link finishRelease}. Both phases now travel through the same code path.
 *
 * Preflight: throws `WORKING_TREE_DIRTY` if the working tree has uncommitted
 * changes, and (when `tagAndPush` is enabled) `TAG_EXISTS` if the target
 * `v<newVersion>` ref already exists. Both checks run before any file or git
 * mutation so a failed run leaves the repo untouched.
 */
export async function applyRelease(
  plan: ReleasePlan,
  opts: ApplyReleaseOptions,
): Promise<void> {
  const { cwd, tagAndPush = true, createGhRelease = true, workspacePropagation = false } = opts;

  // Preflight — refuse to start if the repo isn't in a state where a release
  // commit + tag can be applied atomically. Unconditional tag check matches
  // finishRelease's stale-plan invariant: a pre-existing v<newVersion> tag
  // means the plan is inconsistent regardless of tagAndPush.
  const dirty = (await git.status(cwd)).trim();
  if (dirty) {
    throw Object.assign(
      new Error(`Working tree must be clean before releasing — commit or stash first.\n${dirty}`),
      { code: "WORKING_TREE_DIRTY" },
    );
  }
  const tag = `v${plan.newVersion}`;
  if (await git.tagExists(cwd, tag)) {
    throw Object.assign(
      new Error(`Tag ${tag} already exists. Bump to a new version or delete the tag.`),
      { code: "TAG_EXISTS" },
    );
  }

  // Build a PersistedReleasePlan equivalent of the in-memory plan and hand it
  // off to finishRelease. The legacy contract has only ever been exercised on
  // single-branch (github-flow) repos, so `strategy: "github-flow"` and
  // `releaseBranchCreated: false` are the correct fixed values here.
  await ensureDir(join(cwd, ".gitwise"));
  await writeFile(
    join(cwd, ".gitwise", `release-${plan.newVersion}.md`),
    plan.notes,
    "utf-8",
  );

  const persistedPlan: PersistedReleasePlan = {
    schema: 1,
    strategy: "github-flow",
    currentVersion: plan.currentVersion,
    newVersion: plan.newVersion,
    suggestedBump: plan.suggestedBump,
    changelog: plan.changelog,
    notes: plan.notes,
    commits: plan.commits,
    preparedAt: new Date().toISOString(),
    baseCommit: await git.headSha(cwd),
    targetBranch: await git.getBranch(cwd),
    releaseBranchCreated: false,
    tokens: plan.tokens,
  };

  await ensureGitignored(cwd, RELEASE_PLAN_REL_PATH);
  await ensureGitignored(cwd, RELEASE_NOTES_GLOB_REL_PATH);
  await saveReleasePlan(cwd, persistedPlan);

  await finishRelease({ cwd, tagAndPush, createGhRelease, workspacePropagation });
}

// ─── finishRelease ───────────────────────────────────────────────────────────

export interface FinishReleaseOptions {
  cwd: string;
  /** Tag locally and push (with `--follow-tags`); default true. */
  tagAndPush?: boolean;
  /** Invoke `gh release create` after the tag is pushed; default true. */
  createGhRelease?: boolean;
  /** Delete the local release branch after gitflow merges; default true. Ignored for github-flow. */
  deleteReleaseBranch?: boolean;
  /**
   * Propagate the new root version into every workspace package's
   * `package.json` (and sibling `plugin.json`) before the github-flow release
   * commit, then stage exactly those manifests alongside the root files so
   * they all land in the same commit. Workspace layout is read from
   * `package.json.workspaces` (array or yarn-style `{ packages: [...] }`);
   * falls back to `packages/*` when the field is missing. Default false.
   * Ignored for gitflow because prepare already committed manifests on the
   * release branch.
   */
  workspacePropagation?: boolean;
}

/**
 * Consume a persisted release plan and finalize the release (ADR-001 / ADR-003).
 *
 * Lifecycle: load plan → validate against live repo state → reload notes from
 * `.gitwise/release-<version>.md` → on github-flow, bump `package.json` and
 * prepend the CHANGELOG entry then commit on the current branch → delete the
 * plan file (BEFORE any irreversible operation — merges, tags, pushes — so a
 * downstream failure cannot trigger a second `finish`; on gitflow this is
 * effectively the same as deleting first because the github-flow block is
 * skipped) → merge `plan.targetBranch` into every `strategy.mergeTargets`
 * entry that isn't `targetBranch` itself → annotate the tag with the reloaded
 * notes, push with `--follow-tags`, and on gitflow also push the develop
 * branch → optionally create the GitHub release (graceful: failure logs but
 * does not roll back) → on gitflow, delete the now fully-merged release
 * branch unless `deleteReleaseBranch === false`.
 *
 * Throws typed errors before mutating anything: `NO_RELEASE_PLAN`,
 * `STALE_PLAN_TAG_EXISTS`, `STALE_PLAN_BRANCH_MISMATCH`, `WORKING_TREE_DIRTY`,
 * `STRATEGY_DEVELOP_MISSING`, plus `INVALID_PLAN_SCHEMA` / `INVALID_PLAN_JSON`
 * surfaced by `loadReleasePlan`. On the github-flow path, a pre-commit hook
 * failure during step 5's release commit surfaces as `COMMIT_HOOK_FAILURE`
 * with the plan file STILL on disk — recover by resolving the hook issue
 * and running `git reset --hard HEAD` to clear the partial manifest/CHANGELOG
 * writes before re-running `gw release finish`, or run `gw release abort` to
 * discard the in-flight release. Once the plan file is deleted at step 6, a
 * failed strategy merge (typically gitflow's develop merge when develop has
 * advanced) surfaces as `FINISH_MERGE_CONFLICT` — the repo is left mid-merge
 * for manual recovery (`git merge --continue` then tag + push by hand) since
 * the plan can no longer be re-run.
 */
export async function finishRelease(opts: FinishReleaseOptions): Promise<void> {
  const {
    cwd,
    tagAndPush = true,
    createGhRelease = true,
    deleteReleaseBranch = true,
    workspacePropagation = false,
  } = opts;

  // 1. Load the persisted plan (also raises INVALID_PLAN_SCHEMA / INVALID_PLAN_JSON).
  const plan = await loadReleasePlan(cwd);
  if (!plan) {
    throw Object.assign(
      new Error(
        `No release plan found at .gitwise/release-plan.json. Run "gw release prepare" first.`,
      ),
      { code: "NO_RELEASE_PLAN" },
    );
  }

  debug("release.finish.start", {
    strategy: plan.strategy,
    newVersion: plan.newVersion,
    targetBranch: plan.targetBranch,
  });

  const strategy = createReleaseStrategy(plan.strategy);
  const tag = `v${plan.newVersion}`;

  // 2. Validate the plan against live repo state. All checks run before any
  // mutation so a stale-plan rejection leaves the file in place for `abort`.

  // 2a. Tag must not already exist (checked unconditionally — the plan is
  // stale even if the user opted out of pushing).
  if (await git.tagExists(cwd, tag)) {
    debug("release.finish.validate.failed", {
      code: "STALE_PLAN_TAG_EXISTS",
      tag,
    });
    throw Object.assign(
      new Error(
        `Tag ${tag} already exists — the saved plan is stale. Run "gw release abort" or delete the tag before retrying.`,
      ),
      { code: "STALE_PLAN_TAG_EXISTS" },
    );
  }

  // 2b. Current branch must match the plan's target branch.
  const currentBranch = await git.getBranch(cwd);
  if (currentBranch !== plan.targetBranch) {
    debug("release.finish.validate.failed", {
      code: "STALE_PLAN_BRANCH_MISMATCH",
      expected: plan.targetBranch,
      actual: currentBranch,
    });
    throw Object.assign(
      new Error(
        `Release plan targets "${plan.targetBranch}" but the current branch is "${currentBranch}". Check out the target branch before running finish.`,
      ),
      { code: "STALE_PLAN_BRANCH_MISMATCH" },
    );
  }

  // 2c. Working tree must be clean of user changes. Filter out paths prepare
  // legitimately leaves dirty: the notes file (user is meant to edit it), the
  // plan file itself (gitignored after the first prepare but still surfaces as
  // untracked the very first time), and the .gitwise/ directory entry (git
  // collapses fully-untracked dirs).
  const expectedDirtyPaths = new Set<string>([
    ".gitwise/",
    ".gitwise/release-plan.json",
    `.gitwise/release-${plan.newVersion}.md`,
  ]);
  // `.gitignore` is conditionally tolerated. Prepare's `ensureGitignored`
  // mutates it on github-flow (the change is deferred to step 6 here because
  // prepare cannot commit on a trunk-based flow). Any *other* user edit to
  // `.gitignore` between prepare and finish would otherwise ride silently
  // into the release commit. Predict the exact bytes `ensureGitignored`
  // would have written from HEAD's `.gitignore` and only tolerate the dirty
  // entry when the working-tree file matches that prediction byte-for-byte
  // — mismatches fall through to WORKING_TREE_DIRTY so the surprise surfaces.
  if (await gitignoreMatchesPrepareOutput(cwd)) {
    expectedDirtyPaths.add(".gitignore");
  }
  const dirtyEntries = (await git.status(cwd))
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.length >= 3)
    .filter((line) => !expectedDirtyPaths.has(line.slice(3).trim()));
  if (dirtyEntries.length > 0) {
    debug("release.finish.validate.failed", {
      code: "WORKING_TREE_DIRTY",
    });
    throw Object.assign(
      new Error(
        `Working tree must be clean before finishing a release — commit or stash first.\n${dirtyEntries.join("\n")}`,
      ),
      { code: "WORKING_TREE_DIRTY" },
    );
  }

  // 2d. Gitflow requires a develop branch to merge into and push.
  const repoConfig = await readRepoConfig(cwd);
  const developBranch = repoConfig?.developBranch ?? "develop";
  if (strategy.requiresDevelop()) {
    if (!(await git.branchExists(cwd, developBranch))) {
      debug("release.finish.validate.failed", {
        code: "STRATEGY_DEVELOP_MISSING",
        developBranch,
      });
      throw Object.assign(
        new Error(
          `GitFlow requires a "${developBranch}" branch but it does not exist.`,
        ),
        { code: "STRATEGY_DEVELOP_MISSING" },
      );
    }
  }

  // 3. Resolve the main branch. For github-flow the plan's targetBranch IS
  // main; for gitflow we auto-detect it via the same helper used elsewhere.
  const mainBranch = strategy.requiresDevelop()
    ? await git.detectBaseBranch(cwd)
    : plan.targetBranch;

  // 4. Reload notes from disk so any user edits between prepare and finish
  // make it into the tag annotation and gh release body. If the file is
  // missing (user deleted it, moved it out for editing, CI cleaned `.gitwise`,
  // …), fall back to the in-memory notes captured at prepare time so the tag
  // is still annotated with the LLM output rather than blowing up with a raw
  // ENOENT. Other read failures (permissions, I/O) surface as a typed
  // NOTES_READ_FAILED so `formatReleaseError` can show an actionable hint.
  const notesPath = join(cwd, ".gitwise", `release-${plan.newVersion}.md`);
  let notes: string;
  try {
    notes = await readFile(notesPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      debug("release.finish.notes.missing", { path: notesPath });
      notes = plan.notes;
    } else {
      const cause = err instanceof Error ? err.message : String(err);
      debug("release.finish.notes.read.failed", { path: notesPath, error: cause });
      throw Object.assign(
        new Error(
          `Failed to read release notes at ${notesPath}: ${cause}. Recreate the file from the plan or run "gw release abort" to discard the in-flight release.`,
        ),
        { code: "NOTES_READ_FAILED" },
      );
    }
  }

  // 5. For github-flow, prepare did NOT mutate package.json / CHANGELOG.md;
  // do those writes now on the current branch and commit. The plan file is
  // intentionally NOT deleted yet: the release commit is local and reversible
  // (`git reset --hard HEAD`), so if a pre-commit hook rejects the commit
  // (`COMMIT_HOOK_FAILURE`) or any write here fails mid-way, the user can
  // recover by clearing the partial state and re-running `gw release finish`,
  // or by running `gw release abort`. ADR-003's "plan gone before any
  // irreversible op" invariant is still honored — the plan delete moves to
  // step 6, before merges/tags/pushes.
  if (!plan.releaseBranchCreated) {
    const pkgPath = join(cwd, "package.json");
    const pkg = await readJSON<Record<string, unknown>>(pkgPath);
    pkg["version"] = plan.newVersion;
    await writeJSON(pkgPath, pkg);

    // Workspace propagation runs after the root bump and before the commit so
    // every package + sibling plugin.json lands in the same release commit.
    // The helper returns the exact list of manifests it touched so we can
    // stage them explicitly below — no `git add packages` sweep.
    let propagatedManifests: string[] = [];
    if (workspacePropagation) {
      propagatedManifests = await propagateVersionToWorkspaces(cwd, plan.newVersion);
    }

    const changelogPath = join(cwd, "CHANGELOG.md");
    const date = new Date().toISOString().split("T")[0];
    const versionHeader = `## [${plan.newVersion}] - ${date}\n\n${plan.changelog}\n\n`;

    if (await fileExists(changelogPath)) {
      const existing = await readFile(changelogPath, "utf-8");
      const headerEnd = existing.indexOf("## [");
      if (headerEnd > 0) {
        await writeFile(
          changelogPath,
          existing.slice(0, headerEnd) + versionHeader + existing.slice(headerEnd),
          "utf-8",
        );
      } else {
        const body = existing.startsWith(CHANGELOG_HEADER)
          ? existing.slice(CHANGELOG_HEADER.length)
          : existing;
        await writeFile(
          changelogPath,
          CHANGELOG_HEADER + versionHeader + body,
          "utf-8",
        );
      }
    } else {
      await writeFile(changelogPath, CHANGELOG_HEADER + versionHeader, "utf-8");
    }

    const stagePaths = ["package.json", "CHANGELOG.md"];
    // prepare's ensureGitignored leaves .gitignore dirty on github-flow (no
    // commit happens there). Fold it into the release commit here so the
    // working tree is clean afterward — otherwise the next prepare trips
    // WORKING_TREE_DIRTY on a leftover ` M .gitignore`.
    if (await fileExists(join(cwd, ".gitignore"))) {
      stagePaths.push(".gitignore");
    }
    // Stage the exact manifests propagation modified — never a broad
    // `git add <workspace-root>`, which would also pick up unrelated
    // untracked work in the same directory.
    stagePaths.push(...propagatedManifests);
    // Route through `applyCommit` (not raw `git.commit`) so a pre-commit hook
    // rejection surfaces as a typed `COMMIT_HOOK_FAILURE` — `formatReleaseError`
    // maps that to a recovery hint instead of the generic `UNKNOWN_HINT`.
    await git.applyCommit({
      message: `chore(release): v${plan.newVersion}`,
      files: stagePaths,
      cwd,
    });
  }

  // 6. Delete the plan file (ADR-003 invariant) BEFORE any irreversible
  // operation — merges, tags, pushes, gh release. Past this point a downstream
  // failure cannot trigger a second `finish` against this plan. For gitflow
  // (`releaseBranchCreated === true`) step 5 above is a no-op, so the delete
  // here lands in the same spot as the pre-fix ordering. For github-flow it
  // lands AFTER the now-successful release commit, shrinking the partial-
  // mutation window so a pre-commit hook failure leaves the plan recoverable.
  await deleteReleasePlan(cwd);

  // 7. Merge into each strategy target. Skip self-merges (github-flow's only
  // target is `plan.targetBranch` itself; nothing to merge there). A merge
  // failure here surfaces as a typed FINISH_MERGE_CONFLICT so the CLI can show
  // an actionable recovery hint. The plan file is already gone at this point
  // (step 6, ADR-003), so the repo is intentionally left mid-merge for the
  // user to resolve with `git merge --continue` and then tag + push manually.
  const mergeTargets = strategy.mergeTargets(mainBranch, developBranch);
  for (const target of mergeTargets) {
    if (target === plan.targetBranch) continue;
    await git.checkout(cwd, target);
    try {
      await git.mergeNoFf(cwd, plan.targetBranch);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      debug("release.finish.merge.failed", {
        target,
        source: plan.targetBranch,
        error: cause,
      });
      throw Object.assign(
        new Error(
          `Failed to merge "${plan.targetBranch}" into "${target}" while finishing v${plan.newVersion}. The release plan file has already been deleted, so finish cannot be re-run. Resolve the conflicts, run "git merge --continue", then tag and push manually: git tag -a v${plan.newVersion} -F .gitwise/release-${plan.newVersion}.md && git push --follow-tags origin ${mainBranch}.\n${cause}`,
        ),
        {
          code: "FINISH_MERGE_CONFLICT",
          target,
          source: plan.targetBranch,
          newVersion: plan.newVersion,
        },
      );
    }
    debug("release.finish.merge.target", {
      target,
      source: plan.targetBranch,
    });
  }

  // 8. Move to the main branch so the tag lives on the release commit there.
  // For github-flow we're already there (we never left). For gitflow we end
  // the merge loop on the last target — usually develop — and need to swap.
  if ((await git.getBranch(cwd)) !== mainBranch) {
    await git.checkout(cwd, mainBranch);
  }

  // 9. Tag and push. Tag annotation = the (possibly edited) notes.
  if (tagAndPush) {
    await git.createTag(cwd, tag, notes);
    await git.pushWithTags(cwd, "origin", mainBranch);
    debug("release.finish.tag.pushed", {
      tag,
      branch: mainBranch,
      remote: "origin",
    });
    if (strategy.requiresDevelop()) {
      await git.push(cwd, "origin", developBranch);
    }
  }

  // 10. Optional GitHub release. Failure here is non-fatal: the tag is
  // already pushed and the user can `gh release create` manually.
  if (createGhRelease) {
    if (await isGhAvailable()) {
      try {
        await createGitHubRelease({
          tag,
          title: tag,
          body: notes,
          cwd,
        });
      } catch (err) {
        debug("release.finish.gh.failed", {
          tag,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      debug("gh not available, skipping GitHub release creation");
    }
  }

  // 11. Gitflow only: delete the release branch. `-d` (safe delete) refuses
  // unless the branch is fully merged into HEAD — and by now it has been
  // merged into both mainBranch and developBranch, so this succeeds.
  if (plan.releaseBranchCreated && deleteReleaseBranch) {
    try {
      await git.deleteBranch(cwd, plan.targetBranch);
    } catch (err) {
      debug("release.finish.branch.delete.failed", {
        branch: plan.targetBranch,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ─── abortRelease ────────────────────────────────────────────────────────────

export interface AbortReleaseOptions {
  cwd: string;
  /** When true, also delete the release branch (gitflow only). Default false. */
  deleteBranch?: boolean;
}

/**
 * Discard an in-flight release (ADR-001 / ADR-003).
 *
 * Loads the persisted plan and removes it from disk. When `deleteBranch` is
 * true AND prepare created a release branch, verifies that branch is fully
 * merged into every strategy merge target (main, and develop for gitflow)
 * BEFORE deleting the plan. If the branch still has unmerged commits, throws
 * `RELEASE_BRANCH_UNMERGED` and leaves both the plan file and the branch in
 * place so the user can recover. Notes (`.gitwise/release-<v>.md`) are never
 * touched — the user may still want them.
 */
export async function abortRelease(opts: AbortReleaseOptions): Promise<void> {
  const { cwd, deleteBranch = false } = opts;

  debug("release.abort.start", { cwd, deleteBranch });

  // 1. Load the plan; absent plan is the only fatal precondition.
  const plan = await loadReleasePlan(cwd);
  if (!plan) {
    throw Object.assign(
      new Error(
        `No release plan found at .gitwise/release-plan.json. Nothing to abort.`,
      ),
      { code: "NO_RELEASE_PLAN" },
    );
  }

  const shouldDeleteBranch = deleteBranch && plan.releaseBranchCreated;

  // 2. Safety check FIRST — refuse upfront if the release branch has commits
  // not yet merged into every strategy target. This runs before the plan file
  // is deleted so the user can investigate or retry the abort.
  let mainBranch = "";
  if (shouldDeleteBranch) {
    const strategy = createReleaseStrategy(plan.strategy);
    const repoConfig = await readRepoConfig(cwd);
    const developBranch = repoConfig?.developBranch ?? "develop";
    mainBranch = strategy.requiresDevelop()
      ? await git.detectBaseBranch(cwd)
      : plan.targetBranch;

    for (const target of strategy.mergeTargets(mainBranch, developBranch)) {
      if (target === plan.targetBranch) continue;
      if (!(await git.isBranchMerged(cwd, plan.targetBranch, target))) {
        throw Object.assign(
          new Error(
            `Refusing to delete release branch "${plan.targetBranch}" — it has commits not present in "${target}". Merge or cherry-pick them first, or remove the branch manually.`,
          ),
          { code: "RELEASE_BRANCH_UNMERGED" },
        );
      }
    }
  }

  // 3. Delete the plan file (idempotent: ENOENT is swallowed by the helper).
  await deleteReleasePlan(cwd);

  // 4. Optionally delete the release branch. `git branch -d` refuses to delete
  // the currently checked-out branch, so move to main first if we're still
  // sitting on the release branch (the usual state right after `prepare`).
  if (shouldDeleteBranch) {
    if ((await git.getBranch(cwd)) === plan.targetBranch) {
      await git.checkout(cwd, mainBranch);
    }
    await git.deleteBranch(cwd, plan.targetBranch);
    debug("release.abort.branch.deleted", { branch: plan.targetBranch });
  }
}

// ─── runReleaseInProcess ─────────────────────────────────────────────────────

export interface RunReleaseInProcessOptions extends PrepareReleaseOptions {
  /**
   * Resolved with the persisted plan after `prepareRelease` writes it. Return
   * `false` (or have the promise reject with `p.isCancel`-style cancellation)
   * to abort: the helper calls {@link abortRelease} which removes the plan
   * file (and any gitflow release branch when `confirmAbortDeletesBranch` is
   * true). The on-disk notes file is always preserved.
   */
  confirm: (plan: PersistedReleasePlan) => Promise<boolean> | boolean;
  /** Forwarded to {@link finishRelease} when `confirm` returns true. */
  finishOptions?: Omit<FinishReleaseOptions, "cwd">;
  /**
   * When `confirm` returns false on a gitflow plan, also delete the release
   * branch that prepare created. Default false. Ignored for github-flow.
   *
   * Pass a callback to decide after the plan exists — useful for CLIs that
   * want to ask "Also delete the release branch?" only when a gitflow
   * release branch was actually created. The callback runs inside the abort
   * paths (post-confirm-false and confirm-threw); errors thrown from it are
   * treated as "do not delete" so the abort itself still completes.
   */
  confirmAbortDeletesBranch?:
    | boolean
    | ((plan: PersistedReleasePlan) => Promise<boolean> | boolean);
}

/**
 * Drive the two-phase release lifecycle inside a single process against the
 * same plan written to and read from `.gitwise/release-plan.json`.
 *
 * Runs {@link prepareRelease}, awaits the caller-supplied `confirm` callback
 * (which receives the persisted plan), and either calls {@link finishRelease}
 * (confirm true) or {@link abortRelease} (confirm false / throws). On
 * confirmed completion the plan file is deleted by `finishRelease`; on abort
 * it is removed by `abortRelease`. The on-disk notes file
 * (`.gitwise/release-<version>.md`) is preserved either way.
 *
 * This is the unified path used by both the legacy `applyRelease` adapter
 * (auto-confirms) and the upcoming `gw release` CLI root action (task_09).
 * Decoupling the prompt into a `confirm` callback keeps core free of CLI UI
 * dependencies (e.g. `@clack/prompts`).
 *
 * Returns the persisted plan when the release was applied, or `null` if the
 * caller declined via `confirm`.
 */
export async function runReleaseInProcess(
  opts: RunReleaseInProcessOptions,
): Promise<PersistedReleasePlan | null> {
  const plan = await prepareRelease(opts);

  const resolveDeleteBranch = async (): Promise<boolean> => {
    const setting = opts.confirmAbortDeletesBranch;
    if (typeof setting !== "function") return setting ?? false;
    try {
      return (await setting(plan)) === true;
    } catch {
      // Never let a CLI-side prompt failure block the abort cleanup.
      return false;
    }
  };

  let confirmed: boolean;
  try {
    confirmed = await opts.confirm(plan);
  } catch (err) {
    await abortRelease({
      cwd: opts.cwd,
      deleteBranch: await resolveDeleteBranch(),
    });
    throw err;
  }

  if (!confirmed) {
    await abortRelease({
      cwd: opts.cwd,
      deleteBranch: await resolveDeleteBranch(),
    });
    return null;
  }

  await finishRelease({ cwd: opts.cwd, ...opts.finishOptions });
  return plan;
}

/**
 * Update the root `version` field of every workspace package's `package.json`
 * (and any sibling `plugin.json`) to match the new release version.
 *
 * The workspace layout is taken from `package.json.workspaces` so repos using
 * `apps/*` / `libs/*` / specific paths all work — not just the historical
 * `packages/*` convention. Both the npm/pnpm array form
 * (`workspaces: ["apps/*", "libs/foo"]`) and the legacy yarn object form
 * (`workspaces: { packages: ["apps/*"] }`) are supported. Missing or empty
 * workspaces falls back to `packages/*` so existing single-layout repos that
 * never declared the field keep working.
 *
 * Returns the cwd-relative paths of every manifest the function actually
 * modified so the caller can stage exactly those files (never a directory
 * sweep, which would also pick up unrelated untracked work).
 */
/**
 * Predict whether the current `.gitignore` equals exactly what prepare's two
 * `ensureGitignored` calls would produce from HEAD's `.gitignore`. Used by
 * `finishRelease`'s working-tree check to tolerate prepare's expected
 * leftover while rejecting unrelated user edits that would otherwise ride
 * silently into the `chore(release): vX.Y.Z` commit.
 *
 * Returns true when the file on disk byte-matches the prediction (so the
 * caller can add `.gitignore` to its allow-list); false when it differs (so
 * the caller falls through to WORKING_TREE_DIRTY).
 *
 * Treats `.gitignore` missing from HEAD as an empty baseline (e.g. a brand-
 * new repo where prepare created the file). Treats `.gitignore` missing from
 * the working tree the same way and lets the equality check decide.
 */
async function gitignoreMatchesPrepareOutput(cwd: string): Promise<boolean> {
  const headContent = (await git.showFileAtHead(cwd, ".gitignore")) ?? "";
  const gitignorePath = join(cwd, ".gitignore");
  const currentContent = (await fileExists(gitignorePath))
    ? await readFile(gitignorePath, "utf-8")
    : "";
  let expected = applyGitignoreEntry(headContent, RELEASE_PLAN_REL_PATH);
  expected = applyGitignoreEntry(expected, RELEASE_NOTES_GLOB_REL_PATH);
  return currentContent === expected;
}

async function propagateVersionToWorkspaces(
  cwd: string,
  version: string,
): Promise<string[]> {
  const patterns = await readWorkspacePatterns(cwd);
  const workspaceDirs = await expandWorkspacePatterns(cwd, patterns);

  const modified: string[] = [];
  for (const dir of workspaceDirs) {
    const pkgPath = join(dir, "package.json");
    if (await fileExists(pkgPath)) {
      const pkg = await readJSON<Record<string, unknown>>(pkgPath);
      pkg["version"] = version;
      await writeJSON(pkgPath, pkg);
      modified.push(relative(cwd, pkgPath));
    }
    // Keep a sibling plugin.json (Claude Code plugin manifest) in lockstep
    // with package.json so its surfaced version doesn't drift after release.
    const pluginPath = join(dir, "plugin.json");
    if (await fileExists(pluginPath)) {
      const plugin = await readJSON<Record<string, unknown>>(pluginPath);
      plugin["version"] = version;
      await writeJSON(pluginPath, plugin);
      modified.push(relative(cwd, pluginPath));
    }
  }
  return modified;
}

/**
 * Detect whether `cwd` is the root of an npm/pnpm/yarn workspaces monorepo
 * (or otherwise uses a `packages/*` layout with at least one nested
 * `package.json`). Single source of truth for the CLI and the skills runner
 * when auto-defaulting `workspacePropagation` per ADR-005.
 *
 * Returns `true` exactly when {@link propagateVersionToWorkspaces} would have
 * at least one manifest to rewrite — i.e. some workspace pattern in the root
 * `package.json` (array form, yarn-object `{ packages: [...] }` form, or the
 * `packages/*` fallback) resolves to a directory containing a `package.json`.
 */
export async function detectWorkspaceRoot(cwd: string): Promise<boolean> {
  const patterns = await readWorkspacePatterns(cwd);
  const dirs = await expandWorkspacePatterns(cwd, patterns);
  for (const dir of dirs) {
    if (await fileExists(join(dir, "package.json"))) return true;
  }
  return false;
}

async function readWorkspacePatterns(cwd: string): Promise<string[]> {
  const pkgPath = join(cwd, "package.json");
  if (!(await fileExists(pkgPath))) return ["packages/*"];
  let parsed: { workspaces?: unknown };
  try {
    parsed = await readJSON<{ workspaces?: unknown }>(pkgPath);
  } catch {
    return ["packages/*"];
  }
  const ws = parsed.workspaces;
  const fromArray = Array.isArray(ws)
    ? ws.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  if (fromArray.length > 0) return fromArray;
  if (ws && typeof ws === "object" && !Array.isArray(ws)) {
    const inner = (ws as { packages?: unknown }).packages;
    if (Array.isArray(inner)) {
      const fromObject = inner.filter(
        (p): p is string => typeof p === "string" && p.length > 0,
      );
      if (fromObject.length > 0) return fromObject;
    }
  }
  return ["packages/*"];
}

async function expandWorkspacePatterns(
  cwd: string,
  patterns: string[],
): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const readdirFn = readdir as unknown as ReaddirWithTypes;
  const matched = new Set<string>();
  for (const pattern of patterns) {
    // npm/yarn workspaces support `!`-prefixed negations to exclude paths.
    // Skipping them is a strict superset of the previous packages/* behavior
    // (which had no notion of exclusion at all) and is safe: we never delete,
    // we only bump versions inside matched directories.
    if (pattern.startsWith("!")) continue;
    const segments = pattern.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    await walkWorkspaceSegments(cwd, segments, 0, matched, readdirFn);
  }
  return Array.from(matched);
}

type ReaddirWithTypes = (
  path: string,
  options: { withFileTypes: true },
) => Promise<Array<{ name: string; isDirectory(): boolean }>>;

async function walkWorkspaceSegments(
  current: string,
  segments: string[],
  index: number,
  out: Set<string>,
  readdirFn: ReaddirWithTypes,
): Promise<void> {
  if (index >= segments.length) {
    out.add(current);
    return;
  }
  const segment = segments[index] ?? "";
  if (!segment.includes("*")) {
    await walkWorkspaceSegments(
      join(current, segment),
      segments,
      index + 1,
      out,
      readdirFn,
    );
    return;
  }
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdirFn(current, { withFileTypes: true });
  } catch {
    return;
  }
  const regex = segmentToRegex(segment);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!regex.test(entry.name)) continue;
    await walkWorkspaceSegments(
      join(current, entry.name),
      segments,
      index + 1,
      out,
      readdirFn,
    );
  }
}

function segmentToRegex(segment: string): RegExp {
  // `*` matches any run of non-slash chars; `?` matches a single non-slash char.
  // Other regex metacharacters are escaped so a literal `.` in a workspace name
  // (e.g. `pkg.v2`) matches literally rather than as a wildcard.
  const escaped = segment
    .split(/(\*|\?)/)
    .map((part) => {
      if (part === "*") return "[^/]*";
      if (part === "?") return "[^/]";
      return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${escaped}$`);
}
