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

export function makeReleaseCommand(): Command {
  return new Command("release")
    .description("Versioned release with changelog and release notes")
    .option("--bump <type>", "Override version bump type: major | minor | patch")
    .option("--apply", "Skip confirmation and apply release immediately")
    .option("--no-gh-release", "Skip creating a GitHub release (tag only)")
    .action(async (opts: { bump?: string; apply: boolean; ghRelease: boolean }) => {
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

      try {
        await applyRelease(plan, {
          cwd,
          createGhRelease: opts.ghRelease,
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
