import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as git from "../infra/git.js";
import { isGhAvailable, createGitHubRelease } from "../infra/github.js";
import { fileExists, readJSON, writeJSON, ensureDir } from "../infra/filesystem.js";
import { loadTemplate } from "../template/loader.js";
import { interpolate } from "../template/interpolate.js";
import type { LLMProvider } from "../providers/types.js";
import { resolveModelTier } from "../providers/model-router.js";
import { debug } from "../infra/logger.js";

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
  }
}

interface VersionSuggestion {
  suggestion: BumpType;
  reasoning: string;
}

function parseVersionSuggestion(raw: string): VersionSuggestion | null {
  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed.suggestion === "string" && typeof parsed.reasoning === "string") {
      return parsed as unknown as VersionSuggestion;
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

// ─── applyRelease ────────────────────────────────────────────────────────────

/**
 * Apply a release plan to the repository: bump manifests, rewrite CHANGELOG,
 * commit, tag, push, and optionally create a GitHub release.
 *
 * Preflight: throws `WORKING_TREE_DIRTY` if the working tree has uncommitted
 * changes, and (when `tagAndPush` is enabled) `TAG_EXISTS` if the target
 * `v<newVersion>` ref already exists. Both checks run before any file or git
 * mutation so a failed run leaves the repo untouched.
 *
 * Failure modes after preflight: if `git push` fails (step 7), the release
 * commit and annotated tag remain local — recover with
 * `git push origin HEAD --follow-tags`. If `gh release create` fails (step 8),
 * the local commit, tag, and remote ref are intact; the GitHub release alone
 * is missing and can be created manually with `gh release create`.
 */
export async function applyRelease(
  plan: ReleasePlan,
  opts: ApplyReleaseOptions,
): Promise<void> {
  const { cwd, tagAndPush = true, createGhRelease = true, workspacePropagation = false } = opts;

  // Preflight — refuse to start if the repo isn't in a state where a release
  // commit + tag can be applied atomically.
  const dirty = (await git.status(cwd)).trim();
  if (dirty) {
    throw Object.assign(
      new Error(`Working tree must be clean before releasing — commit or stash first.\n${dirty}`),
      { code: "WORKING_TREE_DIRTY" },
    );
  }
  if (tagAndPush) {
    const tag = `v${plan.newVersion}`;
    if (await git.tagExists(cwd, tag)) {
      throw Object.assign(
        new Error(`Tag ${tag} already exists. Bump to a new version or delete the tag.`),
        { code: "TAG_EXISTS" },
      );
    }
  }

  // 1. Update root package.json
  const pkgPath = join(cwd, "package.json");
  const pkg = await readJSON<Record<string, unknown>>(pkgPath);
  pkg["version"] = plan.newVersion;
  await writeJSON(pkgPath, pkg);

  // 2. Workspace propagation
  if (workspacePropagation) {
    await propagateVersionToWorkspaces(cwd, plan.newVersion);
  }

  // 3. Update CHANGELOG.md
  const changelogPath = join(cwd, "CHANGELOG.md");
  const date = new Date().toISOString().split("T")[0];
  const versionHeader = `## [${plan.newVersion}] - ${date}\n\n${plan.changelog}\n\n`;

  if (await fileExists(changelogPath)) {
    const existing = await readFile(changelogPath, "utf-8");
    // If the file starts with the standard header, insert after it
    const headerEnd = existing.indexOf("## [");
    if (headerEnd > 0) {
      const newContent = existing.slice(0, headerEnd) + versionHeader + existing.slice(headerEnd);
      await writeFile(changelogPath, newContent, "utf-8");
    } else {
      // No version entries yet. Strip any pre-existing standard header so the
      // rewrite doesn't end up with two copies of CHANGELOG_HEADER stacked.
      const body = existing.startsWith(CHANGELOG_HEADER)
        ? existing.slice(CHANGELOG_HEADER.length)
        : existing;
      await writeFile(changelogPath, CHANGELOG_HEADER + versionHeader + body, "utf-8");
    }
  } else {
    await writeFile(changelogPath, CHANGELOG_HEADER + versionHeader, "utf-8");
  }

  // 4. Write release notes file
  await ensureDir(join(cwd, ".gitwise"));
  await writeFile(join(cwd, ".gitwise", `release-${plan.newVersion}.md`), plan.notes, "utf-8");

  // 5. Stage and commit
  const filesToCommit = ["package.json", "CHANGELOG.md"];
  if (workspacePropagation) {
    // We'll just git add all modified package.json files
    filesToCommit.push("packages");
  }
  await git.add(cwd, ["package.json", "CHANGELOG.md"]);
  if (workspacePropagation) {
    try {
      await git.add(cwd, ["packages"]);
    } catch {
      // packages directory might not exist
    }
  }
  await git.commit(cwd, `chore(release): v${plan.newVersion}`);

  if (tagAndPush) {
    // 6. Create tag
    await git.createTag(cwd, `v${plan.newVersion}`, `Release v${plan.newVersion}`);

    // 7. Push with tags
    const branch = await git.getBranch(cwd);
    await git.pushWithTags(cwd, "origin", branch);
  }

  // 8. Create GitHub release
  if (createGhRelease) {
    const ghAvailable = await isGhAvailable();
    if (ghAvailable) {
      try {
        await createGitHubRelease({
          tag: `v${plan.newVersion}`,
          title: `v${plan.newVersion}`,
          body: plan.notes,
          cwd,
        });
      } catch (err) {
        debug("Failed to create GitHub release (graceful fallback)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      debug("gh not available, skipping GitHub release creation");
    }
  }
}

async function propagateVersionToWorkspaces(cwd: string, version: string): Promise<void> {
  const packagesDir = join(cwd, "packages");
  if (!(await fileExists(packagesDir))) return;

  const { readdir } = await import("node:fs/promises");
  let entries: string[];
  try {
    entries = await readdir(packagesDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const pkgPath = join(packagesDir, entry, "package.json");
    if (await fileExists(pkgPath)) {
      const pkg = await readJSON<Record<string, unknown>>(pkgPath);
      pkg["version"] = version;
      await writeJSON(pkgPath, pkg);
    }
    // Keep a sibling plugin.json (Claude Code plugin manifest) in lockstep
    // with package.json so its surfaced version doesn't drift after release.
    const pluginPath = join(packagesDir, entry, "plugin.json");
    if (await fileExists(pluginPath)) {
      const plugin = await readJSON<Record<string, unknown>>(pluginPath);
      plugin["version"] = version;
      await writeJSON(pluginPath, plugin);
    }
  }
}
