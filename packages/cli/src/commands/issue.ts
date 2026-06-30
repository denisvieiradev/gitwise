import { Command } from "commander";
import chalk from "chalk";
import * as p from "@clack/prompts";
import {
  getMergedConfig,
  getApiKey,
  createProvider,
  issue,
  applyIssue,
} from "@denisvieiradev/gitwise-core";
import os from "node:os";

function parseList(value: string, previous: string[] = []): string[] {
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return [...previous, ...items];
}

export function makeIssueCommand(): Command {
  return new Command("issue")
    .description("AI-drafted GitHub issue — file a bug or feature request from a description")
    .argument("[description...]", "Free-text description of the bug or feature")
    .option("--label <a,b>", "Comma-separated labels to attach", parseList, [])
    .option("--assignee <user>", "Assign the issue (repeatable or comma-separated)", parseList, [])
    .option("--prompt <text>", "Additional focus instructions for the issue drafter")
    .option("--apply", "Skip confirmation and create the issue immediately")
    .action(
      async (
        descriptionParts: string[],
        opts: { label: string[]; assignee: string[]; prompt?: string; apply: boolean },
      ) => {
        const cwd = process.cwd();
        const homeDir = os.homedir();
        const description = descriptionParts.join(" ").trim();

        let config;
        try {
          config = await getMergedConfig({ cwd, homeDir });
        } catch {
          console.error(chalk.red("Error: Could not load gitwise config."));
          process.exit(1);
        }

        const apiKey = await getApiKey(homeDir);
        const provider = createProvider({ kind: config.provider, models: config.models, apiKey, claudeCliPath: config.claudeCliPath });

        p.intro(chalk.bold("gitwise issue"));

        const spinner = p.spinner();
        spinner.start("Drafting issue…");

        let draft;
        try {
          draft = await issue({
            description,
            prompt: opts.prompt,
            labels: opts.label.length ? opts.label : undefined,
            assignees: opts.assignee.length ? opts.assignee : undefined,
            provider,
            cwd,
          });
        } catch (err: unknown) {
          spinner.stop("Failed");
          const msg = err instanceof Error ? err.message : String(err);
          p.cancel(`Error: ${msg}`);
          process.exit(1);
        }

        spinner.stop("Issue drafted");

        // Display draft
        console.log(chalk.bold("\nTitle:"), chalk.cyan(draft.title));
        if (draft.labels?.length) {
          console.log(chalk.bold("Labels:"), draft.labels.join(", "));
        }
        if (draft.assignees?.length) {
          console.log(chalk.bold("Assignees:"), draft.assignees.join(", "));
        }
        console.log(chalk.bold("\nBody:"));
        console.log(chalk.dim("─".repeat(60)));
        console.log(draft.body);
        console.log(chalk.dim("─".repeat(60)));
        console.log(chalk.dim(`\n  Tokens: ${draft.tokens.input} in / ${draft.tokens.output} out`));

        let confirmed = opts.apply;
        if (!confirmed) {
          const answer = await p.confirm({ message: "Create this issue?" });
          if (p.isCancel(answer) || !answer) {
            p.cancel("Cancelled.");
            process.exit(0);
          }
          confirmed = true;
        }

        const applySpinner = p.spinner();
        applySpinner.start("Creating issue…");

        let result;
        try {
          result = await applyIssue(draft, { cwd });
        } catch (err: unknown) {
          const code = (err as { code?: unknown })?.code;
          if (code === "GH_UNAVAILABLE") {
            applySpinner.stop("gh CLI not found");
            console.log(chalk.bold("\nTitle:"), chalk.cyan(draft.title));
            console.log(chalk.bold("\nBody:"));
            console.log(chalk.dim("─".repeat(60)));
            console.log(draft.body);
            console.log(chalk.dim("─".repeat(60)));
            p.outro(chalk.yellow("Install the gh CLI (https://cli.github.com) to create issues."));
            return;
          }
          applySpinner.stop("Failed");
          const msg = err instanceof Error ? err.message : String(err);
          p.cancel(`Issue creation failed: ${msg}`);
          process.exit(1);
        }

        applySpinner.stop("Done");
        p.outro(chalk.green(`Issue: ${result.url}`));
      },
    );
}
