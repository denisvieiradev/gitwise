import { Command } from "commander";
import * as p from "@clack/prompts";
import { readConfig } from "../../core/config.js";
import { readState } from "../../core/state.js";
import { PHASE_CONFIG } from "../../core/types.js";
import type { FeatureState, Phase } from "../../core/types.js";

export function makeStatusCommand(): Command {
  return new Command("status")
    .description("Show status of all features")
    .action(async () => {
      const cwd = process.cwd();
      p.intro("devflow status");
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }
      const state = await readState(cwd);
      const features = Object.entries(state.features);
      if (features.length === 0) {
        p.log.info("No features found. Start with `devflow prd <description>`.");
        p.outro("");
        return;
      }
      for (const [ref, feature] of features) {
        const completedTasks = feature.tasks.filter((t) => t.completed).length;
        const totalTasks = feature.tasks.length;
        const phaseInfo = PHASE_CONFIG[feature.phase];
        const phaseLabel = phaseInfo?.label ?? feature.phase;
        const nextStep = phaseInfo?.nextStep ?? "unknown";
        p.log.info(`${ref}`);
        p.log.message(`  Phase: ${phaseLabel}`);
        if (totalTasks > 0) {
          p.log.message(`  Tasks: ${completedTasks}/${totalTasks} completed`);
        }
        p.log.message(`  Next: ${nextStep}`);
        p.log.message("");
      }
      p.outro(`${features.length} feature(s) tracked.`);
    });
}
