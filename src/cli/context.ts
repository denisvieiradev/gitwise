import * as p from "@clack/prompts";
import { readConfig } from "../core/config.js";
import { readState } from "../core/state.js";
import { resolveFeatureRef } from "../core/pipeline.js";
import type { DevflowConfig, DevflowState } from "../core/types.js";

export interface FeatureContext {
  cwd: string;
  config: DevflowConfig;
  state: DevflowState;
  featureRef: string;
}

export async function withFeatureContext(
  cwd: string,
  ref: string | undefined,
  commandName: string,
): Promise<FeatureContext> {
  const config = await readConfig(cwd);
  if (!config) {
    p.cancel("No config found. Run `devflow init` first.");
    process.exit(1);
  }
  const state = await readState(cwd);
  if (!ref) {
    p.cancel(`Feature reference is required. Usage: devflow ${commandName} <ref>`);
    process.exit(1);
  }
  const featureRef = await resolveFeatureRef(cwd, state, ref);
  if (!featureRef) {
    p.cancel(`Feature '${ref}' not found.`);
    process.exit(1);
  }
  return { cwd, config, state, featureRef };
}
