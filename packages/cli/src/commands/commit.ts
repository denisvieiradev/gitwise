import { Command } from "commander";
import chalk from "chalk";
import * as p from "@clack/prompts";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  commit,
  applyCommitPlan,
  git,
} from "@denisvieiradev/gitwise-core";
import type { SplitMode } from "@denisvieiradev/gitwise-core";
import os from "node:os";

export function makeCommitCommand(): Command {
  return new Command("commit")
    .description("Generate intelligent commit message from staged changes")
    .argument("[intent]", "Optional description of what the changes are for")
    .option("--split <mode>", "Split mode: auto | never | always (default: auto)", "auto")
    .option("--push", "Push after committing")
    .option("--apply", "Skip confirmation and apply immediately")
    .action(async (intent: string | undefined, opts: { split: string; push: boolean; apply: boolean }) => {
      const cwd = process.cwd();
      const homeDir = os.homedir();

      let config;
      try {
        config = await getMergedConfig({ cwd, homeDir });
      } catch {
        console.error(chalk.red("Error: Could not load gitwise config. Run `gw config` to set up."));
        process.exit(1);
      }

      const apiKey = await getApiKey(homeDir);
      const provider = createProvider({ kind: config.provider, models: config.models, apiKey, claudeCliPath: config.claudeCliPath });
      const splitMode = (["auto", "never", "always"].includes(opts.split) ? opts.split : "auto") as SplitMode;

      p.intro(chalk.bold("gitwise commit"));

      const spinner = p.spinner();
      spinner.start("Analyzing staged changes…");

      let plan;
      try {
        plan = await commit({
          prompt: intent,
          split: splitMode,
          provider,
          cwd,
        });
      } catch (err: unknown) {
        spinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("NOTHING_STAGED")) {
          p.cancel("No staged changes. Use `git add` to stage files first.");
        } else if (msg.includes("SENSITIVE_FILE_STAGED")) {
          p.cancel(`Sensitive file detected: ${msg}`);
        } else {
          p.cancel(`Error: ${msg}`);
        }
        process.exit(1);
      }

      spinner.stop("Analysis complete");

      // Display plan
      if (plan.kind === "single") {
        const [c] = plan.commits;
        console.log(chalk.bold("\nProposed commit:"));
        console.log(chalk.cyan(`  ${c!.message}`));
        if (c!.description) console.log(chalk.dim(`  ${c!.description}`));
      } else {
        console.log(chalk.bold(`\nProposed ${plan.commits.length} commits:`));
        plan.commits.forEach((c, i) => {
          console.log(chalk.cyan(`  ${i + 1}. ${c.message}`));
        });
      }
      console.log(chalk.dim(`\n  Tokens: ${plan.tokens.input} in / ${plan.tokens.output} out`));

      let confirmed = opts.apply;
      if (!confirmed) {
        const answer = await p.confirm({ message: "Apply this commit plan?" });
        if (p.isCancel(answer) || !answer) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        confirmed = true;
      }

      const applySpinner = p.spinner();
      applySpinner.start("Committing…");

      try {
        await applyCommitPlan(plan, { cwd });
      } catch (err: unknown) {
        applySpinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        p.cancel(`Commit failed: ${msg}`);
        process.exit(1);
      }

      if (opts.push) {
        applySpinner.message("Pushing…");
        try {
          await git.push(cwd, "origin", "HEAD");
        } catch {
          applySpinner.stop("Committed (push failed — check remote)");
          p.outro(chalk.yellow("Committed but push failed. Run `git push` manually."));
          return;
        }
      }

      applySpinner.stop("Done");
      p.outro(chalk.green("Committed successfully!"));
    });
}
