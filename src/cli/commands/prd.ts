import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { readConfig } from "../../core/config.js";
import { readState, writeState, addFeature, updatePhase, setArtifact } from "../../core/state.js";
import { getNextFeatureNumber, generateSlug, formatFeatureRef, getFeaturePath } from "../../core/pipeline.js";
import { TemplateEngine } from "../../core/template.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { ensureDir, fileExists } from "../../infra/filesystem.js";
import type { FeatureState } from "../../core/types.js";

export function makePrdCommand(): Command {
  return new Command("prd")
    .description("Generate a PRD from a feature description")
    .argument("<description...>", "Feature description in natural language")
    .action(async (descriptionParts: string[]) => {
      const description = descriptionParts.join(" ");
      const cwd = process.cwd();
      p.intro("devflow prd");
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }
      validateProvider(config);
      let state = await readState(cwd);
      const number = getNextFeatureNumber(state);
      const slug = generateSlug(description);
      const featureRef = formatFeatureRef(number, slug);
      const featurePath = getFeaturePath(cwd, featureRef);
      const existingPrdPath = `${featurePath}/prd.md`;
      if (await fileExists(existingPrdPath)) {
        const overwrite = await p.confirm({
          message: `PRD already exists at ${existingPrdPath}. Overwrite?`,
        });
        if (p.isCancel(overwrite) || !overwrite) {
          p.cancel("PRD generation cancelled.");
          process.exit(0);
        }
      }
      p.log.info(`Feature: ${featureRef}`);
      const provider = createProvider(config);
      const tier = resolveModelTier("prd");
      const spinner = ora();
      let clarificationResponse;
      try {
        spinner.start("Generating clarification questions...");
        clarificationResponse = await provider.chat({
          systemPrompt:
            "You are a product manager. Given a feature description, generate 3-5 clarification questions to ask before writing a PRD. Return only the numbered questions, nothing else.",
          messages: [{ role: "user", content: description }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }
      const questions = clarificationResponse.content;
      p.log.message(questions);
      const answers = await p.text({
        message: "Your answers to the questions above:",
        placeholder: "Type your answers...",
      });
      if (p.isCancel(answers)) {
        p.cancel("PRD generation cancelled.");
        process.exit(0);
      }
      const templateEngine = new TemplateEngine(config.templatesPath);
      const template = await templateEngine.load("prd");
      const contextBuilder = new ContextBuilder();
      const docs: Document[] = [
        { name: "Description", content: description, priority: "high" },
        { name: "Clarifications", content: `Questions:\n${questions}\n\nAnswers:\n${answers as string}`, priority: "high" },
        { name: "Template", content: template, priority: "medium" },
      ];
      const context = contextBuilder.build(docs, config.contextMode);
      let prdResponse;
      try {
        spinner.start("Generating PRD...");
        prdResponse = await provider.chat({
          systemPrompt: `You are a senior product manager. Generate a complete PRD in Markdown format based on the provided context. Use the template structure provided. Replace all {{variables}} with actual content. Be thorough and specific.`,
          messages: [{ role: "user", content: context }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }
      const now = new Date().toISOString();
      const feature: FeatureState = {
        slug,
        number,
        phase: "initialized",
        tasks: [],
        artifacts: {},
        createdAt: now,
        updatedAt: now,
      };
      state = addFeature(state, featureRef, feature);
      const hash = createHash("sha256").update(prdResponse.content).digest("hex");
      state = setArtifact(state, featureRef, "prd", {
        path: getFeaturePath("", featureRef) + "/prd.md",
        createdAt: now,
        updatedAt: now,
        hash,
      });
      state = updatePhase(state, featureRef, "prd_created");
      await writeState(cwd, state);
      await ensureDir(featurePath);
      const prdPath = `${featurePath}/prd.md`;
      await writeFile(prdPath, prdResponse.content, "utf-8");
      p.log.success(`PRD saved: ${prdPath}`);
      p.outro(`Tokens used: ${prdResponse.usage.inputTokens} in / ${prdResponse.usage.outputTokens} out`);
    });
}
