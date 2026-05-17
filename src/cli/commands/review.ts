import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeState, updatePhase } from "../../core/state.js";
import { getFeaturePath } from "../../core/pipeline.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { fileExists } from "../../infra/filesystem.js";
import * as git from "../../infra/git.js";
import { withFeatureContext } from "../context.js";

export function makeReviewCommand(): Command {
  return new Command("review")
    .description("Automated code review with categorized findings")
    .argument("[ref]", "Feature reference (number or slug)")
    .option("--base <branch>", "Base branch for diff", "main")
    .action(async (ref: string | undefined, options: { base: string }) => {
      const cwd = process.cwd();
      p.intro("devflow review");
      const { config, state: initialState, featureRef } = await withFeatureContext(cwd, ref, "review");
      let state = initialState;
      const featurePath = getFeaturePath(cwd, featureRef);
      let diff: string;
      try {
        diff = await git.getDiff(cwd, options.base);
      } catch {
        diff = await git.getDiff(cwd);
      }
      if (!diff) {
        p.cancel("No diff found between current branch and base.");
        process.exit(1);
      }
      const docs: Document[] = [
        { name: "Diff", content: diff, priority: "high" },
      ];
      const techspecPath = join(featurePath, "techspec.md");
      if (await fileExists(techspecPath)) {
        docs.push({
          name: "Tech Spec",
          content: await readFile(techspecPath, "utf-8"),
          priority: "medium",
        });
      }
      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("review");
      const contextBuilder = new ContextBuilder();
      const context = contextBuilder.build(docs, config.contextMode);
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
          messages: [{ role: "user", content: context }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }
      const reviewPath = join(featurePath, "review.md");
      await writeFile(reviewPath, response.content, "utf-8");
      p.log.success(`Review saved: ${reviewPath}`);
      const hasCritical = /^#{1,3}\s*critical/im.test(response.content) &&
        !/no critical issues/i.test(response.content);
      if (hasCritical) {
        p.log.warn("Critical findings detected. Consider running `devflow tasks` to generate fix tasks.");
      }
      state = updatePhase(state, featureRef, "reviewing");
      await writeState(cwd, state);
      p.outro(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    });
}
