import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import { isGhAvailable, createPR } from "../../infra/github.js";
import { debug } from "../../infra/logger.js";

export function makePrCommand(): Command {
  return new Command("pr")
    .description("AI-drafted pull request title and description")
    .option("--base <branch>", "Base branch", "main")
    .option("--draft", "Create as a draft PR")
    .action(async (options: { base: string; draft?: boolean }) => {
      const cwd = process.cwd();
      p.intro("gitwise pr");

      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found.");
        process.exit(1);
      }

      const currentBranch = await git.getBranch(cwd);
      const commits = await git.getLog(cwd, `${options.base}..HEAD`);
      if (!commits) {
        p.cancel("No commits found on this branch relative to base.");
        process.exit(1);
      }

      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("pr");
      const spinner = ora();
      let response;
      try {
        spinner.start("Generating PR title and description...");
        response = await provider.chat({
          systemPrompt: `You are a developer creating a pull request. Based on the commit log, generate a PR title and description.

Output format (nothing else):
TITLE: <concise title, max 70 chars>
---
## Summary
<1-3 bullet points>

## Changes
<changelog based on commits>

## Test Plan
<testing checklist>`,
          messages: [{ role: "user", content: `Branch: ${currentBranch}\n\nCommits:\n${commits}` }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      const content = response.content;
      const titleMatch = content.match(/^TITLE:\s*(.+)$/m);
      const title = titleMatch ? titleMatch[1]!.trim() : currentBranch;
      const bodyStart = content.indexOf("---");
      const body = bodyStart >= 0 ? content.slice(bodyStart + 3).trim() : content;

      p.log.info(`Title: ${title}`);
      p.log.message(body);

      const ghAvailable = await isGhAvailable();
      if (!ghAvailable) {
        p.log.warn("GitHub CLI (gh) not found. Copy the title and body above to create the PR manually.");
        p.outro("Done.");
        return;
      }

      const confirm = await p.confirm({ message: "Create this PR?" });
      if (p.isCancel(confirm) || !confirm) {
        p.cancel("PR creation cancelled.");
        process.exit(0);
      }

      spinner.start("Pushing branch and creating PR...");
      try {
        await git.push(cwd, "origin", currentBranch);
      } catch (err: unknown) {
        debug("git push failed (branch may already be pushed)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const pr = await createPR({
        title,
        body,
        base: options.base,
        cwd,
        draft: options.draft,
      });
      spinner.stop();

      p.log.success(`PR created: ${pr.url}`);
      p.outro(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    });
}
