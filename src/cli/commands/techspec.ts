import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeState, updatePhase, setArtifact } from "../../core/state.js";
import { getFeaturePath } from "../../core/pipeline.js";
import { TemplateEngine } from "../../core/template.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { fileExists } from "../../infra/filesystem.js";
import { checkDrift } from "../../core/drift.js";
import { withFeatureContext } from "../context.js";

export function makeTechspecCommand(): Command {
  return new Command("techspec")
    .description("Generate a tech spec from an existing PRD")
    .argument("[ref]", "Feature reference (number or slug)")
    .action(async (ref: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow techspec");
      const { config, state: initialState, featureRef } = await withFeatureContext(cwd, ref, "techspec");
      let state = initialState;
      const driftWarnings = await checkDrift(cwd, featureRef, state);
      for (const warning of driftWarnings) {
        p.log.warn(warning.message);
      }
      const featurePath = getFeaturePath(cwd, featureRef);
      const prdPath = join(featurePath, "prd.md");
      if (!(await fileExists(prdPath))) {
        p.cancel(`PRD not found at ${prdPath}. Run \`devflow prd\` first.`);
        process.exit(1);
      }
      validateProvider(config);
      const prdContent = await readFile(prdPath, "utf-8");
      const provider = createProvider(config);
      const tier = resolveModelTier("techspec");
      const templateEngine = new TemplateEngine(config.templatesPath);
      const template = await templateEngine.load("techspec");
      const contextBuilder = new ContextBuilder();
      const docs: Document[] = [
        { name: "PRD", content: prdContent, priority: "high" },
        { name: "Template", content: template, priority: "medium" },
      ];
      const context = contextBuilder.build(docs, config.contextMode);
      const spinner = ora();
      let response;
      try {
        spinner.start("Generating tech spec...");
        response = await provider.chat({
          systemPrompt: `You are a senior software architect. Generate a detailed technical specification in Markdown based on the PRD provided. Use the template structure as a guide. Include architecture decisions, interfaces, data models, sequencing, and testing strategy. Be thorough and specific.`,
          messages: [{ role: "user", content: context }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }
      const techspecPath = join(featurePath, "techspec.md");
      await writeFile(techspecPath, response.content, "utf-8");
      const hash = createHash("sha256").update(response.content).digest("hex");
      const now = new Date().toISOString();
      state = setArtifact(state, featureRef, "techspec", {
        path: `.devflow/features/${featureRef}/techspec.md`,
        createdAt: now,
        updatedAt: now,
        hash,
      });
      state = updatePhase(state, featureRef, "techspec_created");
      await writeState(cwd, state);
      p.log.success(`Tech spec saved: ${techspecPath}`);
      p.outro(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    });
}
