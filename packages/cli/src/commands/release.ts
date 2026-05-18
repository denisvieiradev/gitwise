import { Command } from "commander";
import chalk from "chalk";
import * as p from "@clack/prompts";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  release,
  applyRelease,
} from "@denisvieiradev/gitwise-core";
import type { BumpType } from "@denisvieiradev/gitwise-core";
import os from "node:os";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// Detect whether `cwd` is the root of an npm workspaces monorepo (or otherwise
// uses a `packages/*` layout). Used to default `workspacePropagation` so the
// CLI keeps every published package in lockstep with the root version per
// ADR-005, without forcing users to pass an explicit flag.
async function detectWorkspaceRoot(cwd: string): Promise<boolean> {
  try {
    const raw = await readFile(join(cwd, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { workspaces?: unknown };
    if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
      return true;
    }
  } catch {
    // fall through to packages/ probe
  }
  try {
    const packagesDir = join(cwd, "packages");
    const entries = await readdir(packagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await access(join(packagesDir, entry.name, "package.json"));
        return true;
      } catch {
        // not a workspace package
      }
    }
  } catch {
    // no packages/ directory
  }
  return false;
}

export function makeReleaseCommand(): Command {
  return new Command("release")
    .description("Versioned release with changelog and release notes")
    .option("--bump <type>", "Override version bump type: major | minor | patch")
    .option("--apply", "Skip confirmation and apply release immediately")
    .option("--no-gh-release", "Skip creating a GitHub release (tag only)")
    .option(
      "--no-workspace-propagation",
      "Skip propagating the new version to packages/*/package.json (auto-detected for workspace roots)",
    )
    .action(async (opts: { bump?: string; apply: boolean; ghRelease: boolean; workspacePropagation: boolean }) => {
      const cwd = process.cwd();
      const homeDir = os.homedir();

      let config;
      try {
        config = await getMergedConfig({ cwd, homeDir });
      } catch {
        console.error(chalk.red("Error: Could not load gitwise config."));
        process.exit(1);
      }

      const apiKey = await getApiKey(homeDir);
      const provider = createProvider({ kind: config.provider, models: config.models, apiKey, claudeCliPath: config.claudeCliPath });

      const bumpType: BumpType | undefined =
        opts.bump === "major" || opts.bump === "minor" || opts.bump === "patch"
          ? opts.bump
          : undefined;

      p.intro(chalk.bold("gitwise release"));

      const spinner = p.spinner();
      spinner.start("Analyzing commits and planning release…");

      let plan;
      try {
        plan = await release({
          bump: bumpType,
          provider,
          cwd,
        });
      } catch (err: unknown) {
        spinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        p.cancel(`Error: ${msg}`);
        process.exit(1);
      }

      spinner.stop("Release plan ready");

      // Display plan
      console.log(chalk.bold("\nVersion:"), chalk.cyan(`${plan.currentVersion} → ${plan.newVersion}`), chalk.dim(`(${plan.suggestedBump} bump)`));
      console.log(chalk.bold("\nChangelog entry:"));
      console.log(chalk.dim("─".repeat(60)));
      console.log(plan.changelog);
      console.log(chalk.dim("─".repeat(60)));
      console.log(chalk.bold("\nRelease notes:"));
      console.log(chalk.dim("─".repeat(60)));
      console.log(plan.notes);
      console.log(chalk.dim("─".repeat(60)));
      console.log(chalk.dim(`\n  Tokens: ${plan.tokens.input} in / ${plan.tokens.output} out`));

      let confirmed = opts.apply;
      if (!confirmed) {
        const answer = await p.confirm({ message: `Apply release ${plan.newVersion}?` });
        if (p.isCancel(answer) || !answer) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        confirmed = true;
      }

      const applySpinner = p.spinner();
      applySpinner.start(`Applying release ${plan.newVersion}…`);

      // Auto-enable workspace propagation for monorepo roots so every
      // packages/*/package.json stays in lockstep with the root version.
      // The user can override with `--no-workspace-propagation`.
      const workspacePropagation =
        opts.workspacePropagation === false ? false : await detectWorkspaceRoot(cwd);

      try {
        await applyRelease(plan, {
          cwd,
          createGhRelease: opts.ghRelease,
          workspacePropagation,
        });
      } catch (err: unknown) {
        applySpinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        p.cancel(`Release failed: ${msg}`);
        process.exit(1);
      }

      applySpinner.stop("Done");
      p.outro(chalk.green(`Released ${plan.newVersion} successfully!`));
    });
}
