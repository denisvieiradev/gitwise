import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeState, updatePhase } from "../../core/state.js";
import { getFeaturePath } from "../../core/pipeline.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { fileExists } from "../../infra/filesystem.js";
import { withFeatureContext } from "../context.js";

const exec = promisify(execFile);

export function makeTestCommand(): Command {
  return new Command("test")
    .description("Generate and run tests based on PRD/techspec requirements")
    .argument("[ref]", "Feature reference (number or slug)")
    .action(async (ref: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow test");
      const { config, state: initialState, featureRef } = await withFeatureContext(cwd, ref, "test");
      let state = initialState;
      const featurePath = getFeaturePath(cwd, featureRef);
      const prdPath = join(featurePath, "prd.md");
      const techspecPath = join(featurePath, "techspec.md");
      const docs: Document[] = [];
      if (await fileExists(prdPath)) {
        docs.push({ name: "PRD", content: await readFile(prdPath, "utf-8"), priority: "high" });
      }
      if (await fileExists(techspecPath)) {
        docs.push({ name: "Tech Spec", content: await readFile(techspecPath, "utf-8"), priority: "high" });
      }
      if (docs.length === 0) {
        p.cancel("No PRD or tech spec found. Cannot generate tests.");
        process.exit(1);
      }
      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("test");
      const contextBuilder = new ContextBuilder();
      const context = contextBuilder.build(docs, config.contextMode);
      const spinner = ora();
      let response;
      try {
        spinner.start("Generating test plan...");
        response = await provider.chat({
          systemPrompt: `You are a QA engineer. Based on the PRD and tech spec, generate a comprehensive test plan with test cases. Include:
1. Unit test suggestions with file paths and test descriptions
2. Integration test suggestions
3. Edge cases to consider
4. Manual QA checklist

Format as Markdown with clear sections.`,
          messages: [{ role: "user", content: context }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }
      const testPlanPath = join(featurePath, "test-plan.md");
      await writeFile(testPlanPath, response.content, "utf-8");
      p.log.success(`Test plan saved: ${testPlanPath}`);
      if (config.project.testFramework) {
        const runTests = await p.confirm({
          message: `Run ${config.project.testFramework} tests now?`,
        });
        if (!p.isCancel(runTests) && runTests) {
          spinner.start("Running tests...");
          try {
            const result = await exec("npm", ["test"], { cwd });
            spinner.stop();
            p.log.success("Tests passed.");
            p.log.message(result.stdout);
          } catch (err: unknown) {
            spinner.stop();
            const execErr = err as { stdout?: string; stderr?: string };
            p.log.error("Tests failed.");
            if (execErr.stdout) p.log.message(execErr.stdout);
            if (execErr.stderr) p.log.message(execErr.stderr);
          }
        }
      }
      state = updatePhase(state, featureRef, "testing");
      await writeState(cwd, state);
      p.outro(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    });
}
