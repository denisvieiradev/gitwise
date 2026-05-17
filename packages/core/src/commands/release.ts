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

export function bumpVersion(current: string, type: BumpType): string {
  const parts = current.replace(/^v/, "").split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
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

export async function applyRelease(
  plan: ReleasePlan,
  opts: ApplyReleaseOptions,
): Promise<void> {
  const { cwd, tagAndPush = true, createGhRelease = true, workspacePropagation = false } = opts;

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
      await writeFile(changelogPath, CHANGELOG_HEADER + versionHeader + existing, "utf-8");
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
  }
}
