import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";

const MAX_DIFF_CHARS = 80_000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated — too large for context window]";
}

export function makeReviewCommand(): Command {
  return new Command("review")
    .description("AI-powered pre-push code review with categorized findings")
    .option("--base <branch>", "Base branch for diff", "main")
    .action(async (options: { base: string }) => {
      const cwd = process.cwd();
      p.intro("gitwise review");

      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `gitwise commit` once to set up your config.");
        process.exit(1);
      }

      let diff: string;
      try {
        diff = await git.getDiff(cwd, options.base);
      } catch {
        try {
          diff = await git.getDiff(cwd);
        } catch (err) {
          p.cancel(`Failed to get diff: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }

      if (!diff) {
        p.cancel("No diff found between current branch and base.");
        process.exit(1);
      }

      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("review");
      const spinner = ora();
      let response;
      try {
        spinner.start("Reviewing code...");
        response = await provider.chat({
          systemPrompt: `You are a senior code reviewer. Analyze the diff and produce a code review with findings in these categories:

## Critical
Issues that must be fixed before merging (bugs, security, data loss).

## Suggestions
Improvements worth considering (performance, readability, patterns).

## Nitpicks
Minor style or convention issues.

For each finding, include:
- File and line reference
- Description of the issue
- Suggested fix

End with a summary: total findings count per category and overall recommendation (approve, request changes).`,
          messages: [{ role: "user", content: truncateDiff(diff) }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      p.log.message(response.content);
      p.outro(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    });
}
