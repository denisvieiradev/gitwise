import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../../core/config.js";
import { readState, updatePhase, writeState } from "../../core/state.js";
import { resolveFeatureRef } from "../../core/pipeline.js";
import { TemplateEngine } from "../../core/template.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import { isGhAvailable, createGitHubRelease } from "../../infra/github.js";
import { fileExists, readJSON, writeJSON, ensureDir } from "../../infra/filesystem.js";

interface VersionSuggestion {
  suggestion: "major" | "minor" | "patch";
  reasoning: string;
}

type BumpType = "major" | "minor" | "patch";

function bumpVersion(current: string, type: BumpType): string {
  const parts = current.replace(/^v/, "").split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

function parseVersionSuggestion(raw: string): VersionSuggestion | null {
  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.suggestion && parsed.reasoning) return parsed;
  } catch { /* fallback */ }
  return null;
}

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org/).

`;

export function makeReleaseCommand(): Command {
  return new Command("release")
    .description("Create a new release with version bump, changelog, and release notes")
    .argument("[ref]", "Feature reference (optional — ties release to pipeline)")
    .action(async (ref: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow release");

      // --- Pre-flight checks ---
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      const pkgPath = join(cwd, "package.json");
      if (!(await fileExists(pkgPath))) {
        p.cancel("No package.json found in current directory.");
        process.exit(1);
      }

      const dirty = await git.status(cwd);
      if (dirty) {
        p.cancel("You have uncommitted changes. Please commit or stash them first.");
        process.exit(1);
      }

      validateProvider(config);

      // --- Resolve pipeline context (optional) ---
      let featureRef: string | undefined;
      let state = await readState(cwd);
      if (ref) {
        const resolved = await resolveFeatureRef(cwd, state, ref);
        if (!resolved) {
          p.cancel(`Feature '${ref}' not found.`);
          process.exit(1);
        }
        featureRef = resolved;
      }

      // --- Determine commits since last tag ---
      const lastTag = await git.getLatestTag(cwd);
      if (lastTag) {
        p.log.info(`Last tag: ${chalk.cyan(lastTag)}`);
      } else {
        p.log.info("No previous tags found. This will be the first release.");
      }

      const logRange = lastTag ? `${lastTag}..HEAD` : undefined;
      const commits = await git.getLog(cwd, logRange);
      if (!commits) {
        p.cancel("No new commits since last release.");
        process.exit(1);
      }

      const pkg = await readJSON<{ version: string }>(pkgPath);
      const currentVersion = pkg.version;
      p.log.info(`Current version: ${chalk.cyan(currentVersion)}`);

      // --- AI: Suggest version bump ---
      const provider = createProvider(config);
      const tier = resolveModelTier("release");
      const templateEngine = new TemplateEngine(
        join(cwd, config.templatesPath),
      );

      const versionTemplate = await templateEngine.load("release-version");
      const versionPrompt = templateEngine.interpolate(versionTemplate, {
        currentVersion,
      });

      const spinner = ora();
      let suggestion: VersionSuggestion | null = null;
      try {
        spinner.start("Analyzing commits for version suggestion...");
        const response = await provider.chat({
          systemPrompt: versionPrompt,
          messages: [{ role: "user", content: `Commits:\n${commits}` }],
          model: tier,
        });
        spinner.stop();
        suggestion = parseVersionSuggestion(response.content);
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      if (suggestion) {
        p.log.info(
          `AI suggests ${chalk.bold(suggestion.suggestion.toUpperCase())} bump: ${suggestion.reasoning}`,
        );
      }

      const defaultBump = suggestion?.suggestion ?? "patch";
      const bumpChoices: BumpType[] = ["patch", "minor", "major"];
      const bumpResult = await p.select({
        message: "Select version bump:",
        options: bumpChoices.map((b) => ({
          value: b,
          label: `${b} (${bumpVersion(currentVersion, b)})${b === defaultBump ? chalk.yellow(" ← suggested") : ""}`,
        })),
        initialValue: defaultBump,
      });
      if (p.isCancel(bumpResult)) {
        p.cancel("Release cancelled.");
        process.exit(0);
      }
      const bumpType = bumpResult as BumpType;

      const newVersion = bumpVersion(currentVersion, bumpType);
      const confirmVersion = await p.confirm({
        message: `Release ${chalk.green(`v${newVersion}`)}? (current: v${currentVersion})`,
      });
      if (p.isCancel(confirmVersion) || !confirmVersion) {
        p.cancel("Release cancelled.");
        process.exit(0);
      }

      // --- AI: Generate technical changelog ---
      const changelogTemplate = await templateEngine.load("release-changelog");
      const changelogPrompt = templateEngine.interpolate(changelogTemplate, {
        projectName: config.project.name || "this project",
      });

      let changelog: string;
      try {
        spinner.start("Generating technical changelog...");
        const response = await provider.chat({
          systemPrompt: changelogPrompt,
          messages: [{ role: "user", content: `Commits:\n${commits}` }],
          model: tier,
        });
        spinner.stop();
        changelog = response.content.replace(/```markdown?\n?/g, "").replace(/```/g, "").trim();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      p.log.message(chalk.dim("--- Changelog Preview ---"));
      p.log.message(changelog);
      p.log.message(chalk.dim("--- End Preview ---"));

      const confirmChangelog = await p.confirm({
        message: "Accept this changelog?",
      });
      if (p.isCancel(confirmChangelog) || !confirmChangelog) {
        p.cancel("Release cancelled.");
        process.exit(0);
      }

      // --- AI: Generate client release notes ---
      const language = await p.select({
        message: "Select language for release notes:",
        options: [
          { value: "English", label: "English" },
          { value: "Portuguese", label: "Portuguese" },
          { value: "Spanish", label: "Spanish" },
          { value: "French", label: "French" },
        ],
      });
      if (p.isCancel(language)) {
        p.cancel("Release cancelled.");
        process.exit(0);
      }

      const notesTemplate = await templateEngine.load("release-notes");
      const notesPrompt = templateEngine.interpolate(notesTemplate, {
        version: newVersion,
        projectName: config.project.name || "this project",
        language: language as string,
      });

      let releaseNotes: string;
      try {
        spinner.start("Generating release notes...");
        const response = await provider.chat({
          systemPrompt: notesPrompt,
          messages: [
            {
              role: "user",
              content: `Commits:\n${commits}\n\nTechnical changelog:\n${changelog}`,
            },
          ],
          model: tier,
        });
        spinner.stop();
        releaseNotes = response.content.replace(/```markdown?\n?/g, "").replace(/```/g, "").trim();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      p.log.message(chalk.dim("--- Release Notes Preview ---"));
      p.log.message(releaseNotes);
      p.log.message(chalk.dim("--- End Preview ---"));

      const confirmNotes = await p.confirm({
        message: "Accept these release notes?",
      });
      if (p.isCancel(confirmNotes) || !confirmNotes) {
        p.cancel("Release cancelled.");
        process.exit(0);
      }

      // --- Apply changes ---
      spinner.start("Applying changes...");

      // Bump version in package.json
      pkg.version = newVersion;
      await writeJSON(pkgPath, pkg);
      spinner.text = "Bumped version in package.json";

      // Update CHANGELOG.md
      const changelogPath = join(cwd, "CHANGELOG.md");
      const today = new Date().toISOString().split("T")[0];
      const newEntry = `## [${newVersion}] - ${today}\n\n${changelog}\n\n`;
      if (await fileExists(changelogPath)) {
        const existing = await readFile(changelogPath, "utf-8");
        const headerEnd = existing.indexOf("\n## ");
        if (headerEnd !== -1) {
          const header = existing.slice(0, headerEnd + 1);
          const rest = existing.slice(headerEnd + 1);
          await writeFile(changelogPath, header + newEntry + rest, "utf-8");
        } else {
          await writeFile(changelogPath, existing + "\n" + newEntry, "utf-8");
        }
      } else {
        await writeFile(changelogPath, CHANGELOG_HEADER + newEntry, "utf-8");
      }

      // Save release notes
      const releasesDir = join(cwd, ".devflow", "releases");
      await ensureDir(releasesDir);
      const notesPath = join(releasesDir, `v${newVersion}-release-notes.md`);
      await writeFile(notesPath, releaseNotes, "utf-8");

      spinner.stop();
      p.log.success(`Bumped version to ${chalk.green(newVersion)} in package.json`);
      p.log.success("Updated CHANGELOG.md");
      p.log.success(`Saved release notes to ${chalk.dim(`.devflow/releases/v${newVersion}-release-notes.md`)}`);

      // --- Git: commit, tag ---
      await git.add(cwd, ["package.json", "CHANGELOG.md", `.devflow/releases/v${newVersion}-release-notes.md`]);
      await git.commit(cwd, `chore(release): v${newVersion}`);
      p.log.success(`Committed: ${chalk.green(`chore(release): v${newVersion}`)}`);

      await git.createTag(cwd, `v${newVersion}`, `Release v${newVersion}`);
      p.log.success(`Tagged: ${chalk.green(`v${newVersion}`)}`);

      // --- Pipeline: update phase (optional) ---
      if (featureRef) {
        state = updatePhase(state, featureRef, "releasing");
        await writeState(cwd, state);
        p.log.info(`Updated feature phase to ${chalk.cyan("releasing")}`);
      }

      // --- Push and GitHub release ---
      const shouldPush = await p.confirm({
        message: "Push to remote and create GitHub release?",
      });
      if (p.isCancel(shouldPush) || !shouldPush) {
        p.outro(`Released v${newVersion} locally. Run \`git push --follow-tags\` to publish.`);
        return;
      }

      const branch = await git.getBranch(cwd);
      try {
        spinner.start("Pushing to remote...");
        await git.pushWithTags(cwd, "origin", branch);
        spinner.stop();
        p.log.success(`Pushed to ${chalk.cyan(`origin/${branch}`)} (with tags)`);
      } catch (err) {
        spinner.stop();
        p.log.warn(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
        p.log.warn("You can push manually with: git push --follow-tags");
      }

      // GitHub release
      const ghAvailable = await isGhAvailable();
      if (!ghAvailable) {
        p.log.warn("GitHub CLI (gh) not found. Skipping GitHub release.");
        p.log.warn("Install it from https://cli.github.com/ to enable automatic releases.");
      } else {
        try {
          spinner.start("Creating GitHub release...");
          const result = await createGitHubRelease({
            tag: `v${newVersion}`,
            title: `v${newVersion}`,
            body: releaseNotes,
            cwd,
          });
          spinner.stop();
          p.log.success(`GitHub release created: ${chalk.cyan(result.url)}`);
        } catch (err) {
          spinner.stop();
          p.log.warn(`GitHub release failed: ${err instanceof Error ? err.message : String(err)}`);
          p.log.warn("You can create it manually on GitHub.");
        }
      }

      p.outro(`Released v${newVersion}`);
    });
}
