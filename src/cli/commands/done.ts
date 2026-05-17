import { Command } from "commander";
import * as p from "@clack/prompts";
import { writeState, updatePhase } from "../../core/state.js";
import { withFeatureContext } from "../context.js";

export function makeDoneCommand(): Command {
  return new Command("done")
    .description("Finalize a feature and update state")
    .argument("[ref]", "Feature reference (number or slug)")
    .action(async (ref: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow done");
      const { state: initialState, featureRef } = await withFeatureContext(cwd, ref, "done");
      let state = initialState;
      const feature = state.features[featureRef];
      if (!feature) {
        p.cancel(`Feature '${featureRef}' not found in state.`);
        process.exit(1);
      }
      const pendingTasks = feature.tasks.filter((t) => !t.completed);
      if (pendingTasks.length > 0) {
        p.log.warn(`${pendingTasks.length} pending tasks:`);
        for (const task of pendingTasks) {
          p.log.warn(`  - ${task.number}.0 ${task.title}`);
        }
        const proceed = await p.confirm({
          message: "Finalize anyway?",
        });
        if (p.isCancel(proceed) || !proceed) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
      }
      state = updatePhase(state, featureRef, "done");
      await writeState(cwd, state);
      p.log.success(`Feature ${featureRef} marked as done.`);
      p.outro("Feature finalized.");
    });
}
