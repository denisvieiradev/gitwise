import { Command } from "commander";
import chalk from "chalk";
import * as p from "@clack/prompts";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  pr,
  applyPr,
} from "@denisvieiradev/gitwise-core";
import os from "node:os";

export function makePrCommand(): Command {
  return new Command("pr")
    .description("AI-drafted pull request — create or update a GitHub PR")
    .option("--base <branch>", "Base branch for the PR (default: auto-detect main/master)")
    .option("--prompt <text>", "Additional focus instructions for the PR drafter")
    .option("--apply", "Skip confirmation and create/update PR immediately")
    .option("--draft", "Create the PR as a draft")
    .action(async (opts: { base?: string; prompt?: string; apply: boolean; draft: boolean }) => {
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

      p.intro(chalk.bold("gitwise pr"));

      const spinner = p.spinner();
      spinner.start("Drafting PR…");

      let draft;
      try {
        draft = await pr({
          baseBranch: opts.base,
          prompt: opts.prompt,
          provider,
          cwd,
        });
      } catch (err: unknown) {
        spinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("EMPTY_DIFF")) {
          p.cancel("No changes to draft a PR for — diff is empty.");
        } else {
          p.cancel(`Error: ${msg}`);
        }
        process.exit(1);
      }

      spinner.stop("PR drafted");

      // Display draft
      console.log(chalk.bold("\nTitle:"), chalk.cyan(draft.title));
      console.log(chalk.bold("\nBody:"));
      console.log(chalk.dim("─".repeat(60)));
      console.log(draft.body);
      console.log(chalk.dim("─".repeat(60)));
      console.log(chalk.dim(`\n  Tokens: ${draft.tokens.input} in / ${draft.tokens.output} out`));

      let confirmed = opts.apply;
      if (!confirmed) {
        const answer = await p.confirm({ message: "Create/update this PR?" });
        if (p.isCancel(answer) || !answer) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
        confirmed = true;
      }

      const applySpinner = p.spinner();
      applySpinner.start("Creating/updating PR…");

      let result;
      try {
        result = await applyPr(draft, { cwd, draft: opts.draft, baseBranch: opts.base });
      } catch (err: unknown) {
        const code = (err as { code?: unknown })?.code;
        if (code === "GH_UNAVAILABLE") {
          applySpinner.stop("gh CLI not found");
          console.log(chalk.bold("\nTitle:"), chalk.cyan(draft.title));
          console.log(chalk.bold("\nBody:"));
          console.log(chalk.dim("─".repeat(60)));
          console.log(draft.body);
          console.log(chalk.dim("─".repeat(60)));
          p.outro(chalk.yellow("Install the gh CLI (https://cli.github.com) to create or update PRs."));
          return;
        }
        applySpinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        p.cancel(`PR creation failed: ${msg}`);
        process.exit(1);
      }

      applySpinner.stop("Done");
      p.outro(chalk.green(`PR: ${result.url}`));
    });
}
