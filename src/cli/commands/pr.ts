import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { readState, writeState, updatePhase } from "../../core/state.js";
import { resolveFeatureRef } from "../../core/pipeline.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import { isGhAvailable, createPR } from "../../infra/github.js";
import { debug } from "../../infra/logger.js";

export function makePrCommand(): Command {
  return new Command("pr")
    .description("Create a pull request from feature branch")
    .argument("[ref]", "Feature reference (number or slug)")
    .option("--base <branch>", "Base branch", "main")
    .action(async (ref: string | undefined, options: { base: string }) => {
      const cwd = process.cwd();
      p.intro("devflow pr");
      if (!(await isGhAvailable())) {
        p.cancel("GitHub CLI (gh) is not installed. Install it from https://cli.github.com");
        process.exit(1);
      }
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }
      let state = await readState(cwd);
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
      });
      spinner.stop();
      if (ref) {
        const featureRef = await resolveFeatureRef(cwd, state, ref);
        if (featureRef) {
          state = updatePhase(state, featureRef, "pr_created");
          await writeState(cwd, state);
        }
      }
      p.log.success(`PR created: ${pr.url}`);
      p.outro("Done.");
    });
}
