import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeState, updatePhase, completeTask } from "../../core/state.js";
import { getFeaturePath } from "../../core/pipeline.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { fileExists } from "../../infra/filesystem.js";
import * as git from "../../infra/git.js";
import { checkDrift } from "../../core/drift.js";
import type { TaskState } from "../../core/types.js";
import { withFeatureContext } from "../context.js";

export function makeRunTasksCommand(): Command {
  return new Command("run-tasks")
    .description("Execute pending tasks sequentially with auto-commit")
    .argument("[ref]", "Feature reference (number or slug)")
    .action(async (ref: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow run-tasks");
      const { config, state: initialState, featureRef } = await withFeatureContext(cwd, ref, "run-tasks");
      let state = initialState;
      const feature = state.features[featureRef];
      if (!feature) {
        p.cancel(`Feature '${featureRef}' not found in state.`);
        process.exit(1);
      }
      if (feature.phase !== "in_progress") {
        state = updatePhase(state, featureRef, "in_progress");
      }
      const driftWarnings = await checkDrift(cwd, featureRef, state);
      for (const warning of driftWarnings) {
        p.log.warn(warning.message);
      }
      const featurePath = getFeaturePath(cwd, featureRef);
      const pendingTasks = feature.tasks.filter((t: TaskState) => !t.completed);
      if (pendingTasks.length === 0) {
        p.cancel("No pending tasks found.");
        process.exit(0);
      }
      let techspecContent = "";
      const techspecPath = join(featurePath, "techspec.md");
      if (await fileExists(techspecPath)) {
        techspecContent = await readFile(techspecPath, "utf-8");
      }
      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("run-tasks");
      const spinner = ora();
      p.log.info(`${pendingTasks.length} pending tasks to execute.`);
      for (const task of pendingTasks) {
        p.log.step(`Task ${task.number}: ${task.title}`);
        let taskContent = "";
        const taskFilePath = join(featurePath, `${task.number}_task.md`);
        if (await fileExists(taskFilePath)) {
          taskContent = await readFile(taskFilePath, "utf-8");
        }
        const contextBuilder = new ContextBuilder();
        const docs: Document[] = [
          { name: "Task", content: taskContent || `Task ${task.number}: ${task.title}`, priority: "high" },
        ];
        if (techspecContent) {
          docs.push({ name: "Tech Spec", content: techspecContent, priority: "medium" });
        }
        const context = contextBuilder.build(docs, config.contextMode);
        let response;
        try {
          spinner.start(`Executing task ${task.number}...`);
          response = await provider.chat({
            systemPrompt: `You are a senior developer implementing a task. Based on the task description and tech spec, describe what code changes need to be made. Be specific about file paths, function signatures, and implementation details.`,
            messages: [{ role: "user", content: context }],
            model: tier,
          });
          spinner.stop();
        } catch (err) {
          spinner.stop();
          handleLLMError(err);
          return;
        }
        const outputPath = join(featurePath, `${task.number}_output.md`);
        await writeFile(outputPath, response.content, "utf-8");
        state = completeTask(state, featureRef, task.number);
        await writeState(cwd, state);
        try {
          const SENSITIVE_PATTERNS = [".env", ".secret", "credentials", ".key", ".pem"];
          const changedFiles = await git.getChangedFiles(cwd);
          const safeFiles = changedFiles.filter(
            (f) => !SENSITIVE_PATTERNS.some((pat) => f.toLowerCase().includes(pat)),
          );
          if (safeFiles.length === 0) {
            p.log.info(`Task ${task.number} done (no changes to commit)`);
          } else {
            p.log.info(`Staging ${safeFiles.length} file(s): ${safeFiles.join(", ")}`);
            await git.add(cwd, safeFiles);
            const safeTitle = task.title.replace(/[`"'\n\r\t\\]/g, "").slice(0, 100);
            await git.commit(cwd, `feat: complete task ${task.number} - ${safeTitle}`);
            const log = await git.getLog(cwd, undefined, 1);
            p.log.success(`Task ${task.number} done — ${log}`);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("nothing to commit") || message.includes("no changes added")) {
            p.log.info(`Task ${task.number} done (no changes to commit)`);
          } else {
            p.log.warn(`Task ${task.number} done but git operation failed: ${message}`);
          }
        }
      }
      p.outro(`All ${pendingTasks.length} tasks completed.`);
    });
}
