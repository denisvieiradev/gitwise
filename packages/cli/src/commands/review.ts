import { Command } from "commander";
import chalk from "chalk";
import * as p from "@clack/prompts";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  review,
} from "@denisvieiradev/gitwise-core";
import os from "node:os";

export function makeReviewCommand(): Command {
  return new Command("review")
    .description("AI-powered code review of staged/branch changes")
    .option("--base <branch>", "Base branch to diff against (default: auto-detect main/master)")
    .option("--prompt <text>", "Additional focus instructions for the reviewer")
    .action(async (opts: { base?: string; prompt?: string }) => {
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

      p.intro(chalk.bold("gitwise review"));

      const spinner = p.spinner();
      spinner.start("Running AI code review…");

      let result;
      try {
        result = await review({
          baseBranch: opts.base,
          prompt: opts.prompt,
          provider,
          cwd,
        });
      } catch (err: unknown) {
        spinner.stop("Failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("EMPTY_DIFF")) {
          p.cancel("No changes to review — diff is empty.");
        } else {
          p.cancel(`Error: ${msg}`);
        }
        process.exit(1);
      }

      spinner.stop("Review complete");

      const total = result.critical.length + result.suggestions.length + result.nitpicks.length;

      if (total === 0) {
        p.outro(chalk.green("No findings. Looks good!"));
        return;
      }

      if (result.critical.length > 0) {
        console.log(chalk.red.bold(`\n### Critical (${result.critical.length})\n`));
        for (const f of result.critical) {
          const prefix = f.file ? chalk.dim(`[${f.file}] `) : "";
          console.log(`  ${prefix}${f.description}`);
          if (f.suggestion) console.log(chalk.dim(`    → ${f.suggestion}`));
        }
      }

      if (result.suggestions.length > 0) {
        console.log(chalk.yellow.bold(`\n### Suggestions (${result.suggestions.length})\n`));
        for (const f of result.suggestions) {
          const prefix = f.file ? chalk.dim(`[${f.file}] `) : "";
          console.log(`  ${prefix}${f.description}`);
          if (f.suggestion) console.log(chalk.dim(`    → ${f.suggestion}`));
        }
      }

      if (result.nitpicks.length > 0) {
        console.log(chalk.dim.bold(`\n### Nitpicks (${result.nitpicks.length})\n`));
        for (const f of result.nitpicks) {
          const prefix = f.file ? chalk.dim(`[${f.file}] `) : "";
          console.log(`  ${prefix}${f.description}`);
          if (f.suggestion) console.log(chalk.dim(`    → ${f.suggestion}`));
        }
      }

      console.log(chalk.dim(`\n  Tokens: ${result.tokens.input} in / ${result.tokens.output} out`));
      p.outro(chalk.bold(`Review complete — ${result.critical.length} critical, ${result.suggestions.length} suggestions, ${result.nitpicks.length} nitpicks`));
    });
}
